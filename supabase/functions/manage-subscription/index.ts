// Avoid Stripe SDK (Node polyfills) — use Stripe REST via fetch
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  persistStripeCustomerId,
  extractSubscriptionSnapshot,
  normalizePlanSlug,
  normalizeBillingCycle,
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; manage-subscription will fail until configured.");
}

const stripeFetch = async (
  method: string,
  path: string,
  body?: Record<string, string | number | boolean | null | undefined>,
) => {
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe not configured");
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };
  let requestBody: BodyInit | undefined;
  if (method !== "GET" && body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      params.append(k, String(v));
    }
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    requestBody = params;
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: requestBody });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Stripe error ${res.status}`), { status: res.status, raw: json });
  return json;
};

const encodeParams = (obj: Record<string, unknown>, prefix = ""): Record<string, string> => {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v) => (flat[`${k}[]`] = String(v)));
    } else if (typeof value === "object") {
      Object.assign(flat, encodeParams(value as Record<string, unknown>, k));
    } else {
      flat[k] = String(value);
    }
  }
  return flat;
};

const ensureCustomerId = async (user: any, meta: Record<string, unknown>) => {
  const existing = (meta?.stripe_customer_id as string | undefined) ?? null;
  if (existing) return existing;
  try {
    const search = await stripeFetch("GET", `/customers/search?query=${encodeURIComponent(`metadata['supabase_user_id']:'${user.id}'`)}&limit=1`);
    if (search?.data?.[0]?.id) {
      await persistStripeCustomerId(user.id, search.data[0].id, { supabaseUser: user, existingMetadata: meta });
      return search.data[0].id;
    }
  } catch {}
  if (user.email) {
    try {
      const listed = await stripeFetch("GET", `/customers?email=${encodeURIComponent(user.email)}&limit=20`);
      const match = (listed.data || []).find((c: any) => (c.email || "").toLowerCase() === (user.email || "").toLowerCase());
      if (match?.id) {
        if (!match.metadata?.supabase_user_id) {
          try { await stripeFetch("POST", `/customers/${match.id}`, encodeParams({ metadata: { supabase_user_id: user.id } })); } catch {}
        }
        await persistStripeCustomerId(user.id, match.id, { supabaseUser: user, existingMetadata: meta });
        return match.id;
      }
    } catch {}
  }
  const created = await stripeFetch("POST", "/customers", encodeParams({ email: user.email ?? undefined, metadata: { supabase_user_id: user.id } }));
  await persistStripeCustomerId(user.id, created.id, { supabaseUser: user, existingMetadata: meta });
  return created.id;
};

type Action = "refresh";

type ManageSubscriptionPayload = {
  action?: Action;
};

const tryResolveSubscription = async (customerId: string, subscriptionId?: string | null) => {
  if (!stripe) return null;
  if (subscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product", "latest_invoice", "schedule", "schedule.phases"],
      });
    } catch (retrieveError) {
      console.warn("Unable to retrieve subscription by id", subscriptionId, retrieveError);
    }
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
      expand: ["data.items.data.price.product", "data.latest_invoice", "data.schedule", "data.schedule.phases"],
    });
    if (!subscriptions.data.length) return null;
    return (
      subscriptions.data.find((sub) => sub.status !== "canceled") ??
      subscriptions.data.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0]
    );
  } catch (listError) {
    console.warn("Unable to list subscriptions for customer", customerId, listError);
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!STRIPE_SECRET_KEY) {
    return internalError("Stripe is not configured");
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ManageSubscriptionPayload = {};
  try {
    payload = await req.json();
  } catch (_err) {
    // allow empty payload
  }

  const action = payload.action ?? "refresh";

  if (action !== "refresh") {
    return badRequest("Unsupported action.");
  }

  try {
    const metadata =
      (user.user_metadata as Record<string, unknown> | undefined) ??
      (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const customerId = await ensureCustomerId(user, metadata);

    const existingSubscriptionId =
      typeof metadata.stripe_subscription_id === "string" ? metadata.stripe_subscription_id : null;

    const subscription = await (async () => {
      // Try retrieve by id
      if (existingSubscriptionId) {
        try {
          const params = new URLSearchParams();
          ["items.data.price.product", "latest_invoice", "schedule", "schedule.phases"].forEach((k) => params.append("expand[]", k));
          return await stripeFetch("GET", `/subscriptions/${existingSubscriptionId}?${params.toString()}`);
        } catch {}
      }
      // Else list
      try {
        const params = new URLSearchParams({ customer: customerId, status: "all", limit: "20" });
        ["data.items.data.price.product", "data.latest_invoice", "data.schedule", "data.schedule.phases"].forEach((k) => params.append("expand[]", k));
        const listed = await stripeFetch("GET", `/subscriptions?${params.toString()}`);
        const data = listed?.data || [];
        if (!data.length) return null;
        return data.find((s: any) => s.status !== "canceled") ?? data.sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))[0];
      } catch {
        return null;
      }
    })();

    if (!subscription) {
      return json({
        subscription: null,
        message: "No active subscription found.",
      });
    }

    const snapshot = extractSubscriptionSnapshot(subscription);
    const normalizedPlan = normalizePlanSlug(snapshot?.planSlug ?? "free") ?? "free";
    const normalizedCycle = normalizeBillingCycle(snapshot?.billingCycle ?? "monthly") ?? "monthly";

    return json({
      subscription: {
        plan_slug: normalizedPlan,
        billing_cycle: normalizedCycle,
        status: subscription.status ?? snapshot?.status ?? null,
        id: subscription.id,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        current_period_end: subscription.current_period_end ?? null,
      },
      message: "Subscription refreshed successfully.",
    });
  } catch (error) {
    return internalError(error);
  }
});

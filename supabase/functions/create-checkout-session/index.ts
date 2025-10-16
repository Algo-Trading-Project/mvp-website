// Avoid Stripe SDK (Node polyfills) — use Stripe REST via fetch
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  persistStripeCustomerId,
  getPriceIdForPlan,
  normalizeBillingCycle,
  normalizePlanSlug,
  planSlugForTier,
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const DEFAULT_SITE_URL = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-checkout-session will fail until configured.");
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
  if (!res.ok) {
    throw Object.assign(new Error(json?.error?.message || `Stripe error ${res.status}`), { status: res.status, raw: json });
  }
  return json;
};

const encodeParams = (obj: Record<string, unknown>, prefix = ""): Record<string, string> => {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        flat[`${k}[]`] = String(v);
      });
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

  // Try search by metadata
  try {
    const search = await stripeFetch("GET", `/customers/search?query=${encodeURIComponent(`metadata['supabase_user_id']:'${user.id}'`)}&limit=1`);
    if (search?.data?.[0]?.id) {
      await persistStripeCustomerId(user.id, search.data[0].id, { supabaseUser: user, existingMetadata: meta });
      return search.data[0].id;
    }
  } catch (_e) {
    // ignore
  }

  // Try list by email
  if (user.email) {
    try {
      const listed = await stripeFetch("GET", `/customers?email=${encodeURIComponent(user.email)}&limit=20`);
      const match = (listed.data || []).find((c: any) => (c.email || "").toLowerCase() === (user.email || "").toLowerCase());
      if (match?.id) {
        // ensure metadata link
        if (!match.metadata?.supabase_user_id) {
          try {
            await stripeFetch("POST", `/customers/${match.id}`, encodeParams({ metadata: { supabase_user_id: user.id } }));
          } catch {}
        }
        await persistStripeCustomerId(user.id, match.id, { supabaseUser: user, existingMetadata: meta });
        return match.id;
      }
    } catch (_e) {}
  }

  // Create
  const created = await stripeFetch("POST", "/customers", encodeParams({
    email: user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  }));
  await persistStripeCustomerId(user.id, created.id, { supabaseUser: user, existingMetadata: meta });
  return created.id;
};

type CheckoutPayload = {
  plan_slug?: string | null;
  plan_tier?: string | null;
  billing_cycle?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
};

const resolvePlanSlug = (payload: CheckoutPayload) => {
  const rawPlan =
    typeof payload.plan_slug === "string" && payload.plan_slug.trim().length
      ? payload.plan_slug.trim()
      : null;
  if (rawPlan) {
    return normalizePlanSlug(rawPlan) ?? null;
  }
  if (typeof payload.plan_tier === "string" && payload.plan_tier.trim().length) {
    return planSlugForTier(payload.plan_tier);
  }
  return null;
};

const coerceUrl = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.length) return fallback;
  try {
    return new URL(trimmed).toString();
  } catch {
    return fallback;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!STRIPE_SECRET_KEY) return internalError("Stripe is not configured");

  const user = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: CheckoutPayload = {};
  try {
    payload = await req.json();
  } catch (_error) {
    // allow empty payload
  }

  const planSlug = resolvePlanSlug(payload);
  if (!planSlug) {
    return badRequest("plan_slug or plan_tier is required.");
  }

  const billingCycleNormalized = normalizeBillingCycle(payload.billing_cycle) ?? "monthly";

  const priceId = getPriceIdForPlan(planSlug, billingCycleNormalized);
  if (!priceId) {
    return badRequest("Unsupported plan/billing_cycle combination.");
  }

  try {
    const metadata =
      (user.user_metadata as Record<string, unknown> | undefined) ??
      (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const customerId = await ensureCustomerId(user, metadata);

    const successUrl = coerceUrl(
      payload.success_url,
      `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/pricing?status=success`,
    );
    const cancelUrl = coerceUrl(
      payload.cancel_url,
      `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/pricing?status=cancel`,
    );

    const params: Record<string, string> = {
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto",
      allow_promotion_codes: "true",
      "payment_method_types[]": "card",
      "subscription_data[metadata][plan_slug]": planSlug,
      "subscription_data[metadata][billing_cycle]": billingCycleNormalized,
      "subscription_data[metadata][user_id]": user.id,
      "metadata[plan_slug]": planSlug,
      "metadata[billing_cycle]": billingCycleNormalized,
      "metadata[user_id]": user.id,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
    };
    const session = await stripeFetch("POST", "/checkout/sessions", params);

    if (!session?.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return json({ url: session.url });
  } catch (error) {
    return internalError(error);
  }
});

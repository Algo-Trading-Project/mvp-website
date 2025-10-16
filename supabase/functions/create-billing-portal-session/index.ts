// Avoid Stripe SDK (Node polyfills) — use Stripe REST via fetch
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { internalError, json, methodNotAllowed } from "../_shared/http.ts";
import { persistStripeCustomerId } from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const DEFAULT_SITE_URL = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";
const STRIPE_PORTAL_CONFIGURATION_ID = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID") ?? null;

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-billing-portal-session will fail until configured.");
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

const normalizeUrl = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.length) return fallback;
  try {
    return new URL(trimmed).toString();
  } catch {
    return fallback;
  }
};

const resolveOriginFromRequest = (req: Request) => {
  const originHeader = req.headers.get("origin");
  if (originHeader) return originHeader;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = req.headers.get("host");
  if (host) {
    const protocol = forwardedProto ?? (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }
  return DEFAULT_SITE_URL;
};

// No portal configuration orchestration here; rely on default configuration unless overridden via ENV

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

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_error) {
    // allow empty payload
  }

  const returnUrl = typeof payload.return_url === "string" ? payload.return_url : null;
  const baseOrigin = resolveOriginFromRequest(req);
  const normalizedBase = baseOrigin.replace(/\/+$/, "");

  try {
    const metadata =
      (user.user_metadata as Record<string, unknown> | undefined) ??
      (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const customerId = await ensureCustomerId(user, metadata);

    // Use default portal configuration unless ENV overrides
    const configurationId = STRIPE_PORTAL_CONFIGURATION_ID ?? undefined;
    const session = await stripeFetch("POST", "/billing_portal/sessions", encodeParams({
      customer: customerId,
      configuration: configurationId,
      return_url: normalizeUrl(returnUrl, `${normalizedBase}/account?from=stripe_portal`),
    }));

    if (!session?.url) {
      throw new Error("Billing portal session did not return a URL");
    }

    return json({ url: session.url });
  } catch (error) {
    return internalError(error);
  }
});

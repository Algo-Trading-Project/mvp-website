import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { internalError, json, methodNotAllowed } from "../_shared/http.ts";
import { ensureStripeCustomerId } from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const DEFAULT_SITE_URL = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";
const STRIPE_PORTAL_CONFIGURATION_ID = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID") ?? null;

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-billing-portal-session will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

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

  if (!stripe) {
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

    const customerId = await ensureStripeCustomerId(stripe, user, metadata, { persist: false });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: STRIPE_PORTAL_CONFIGURATION_ID ?? undefined,
      return_url: normalizeUrl(returnUrl, `${normalizedBase}/account?from=stripe_portal`),
    });

    if (!session.url) {
      throw new Error("Billing portal session did not return a URL");
    }

    return json({ url: session.url });
  } catch (error) {
    return internalError(error);
  }
});

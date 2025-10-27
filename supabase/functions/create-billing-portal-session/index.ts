import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  ensureStripeCustomerId,
  getPriceIdForPlan,
  normalizeBillingCycle,
  normalizePlanSlug,
  planSlugForTier,
} from "../_shared/subscription.ts";

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

    // Try to create a Billing Portal session; if it fails (e.g., canceled subscription under Test Clock),
    // fall back to a Checkout Session to let the user re-subscribe.
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: STRIPE_PORTAL_CONFIGURATION_ID ?? undefined,
        return_url: normalizeUrl(returnUrl, `${normalizedBase}/account?from=stripe_portal`),
      });
      if (!session.url) throw new Error("Billing portal session did not return a URL");
      return json({ url: session.url });
    } catch (portalError) {
      // Fallback: create a new Checkout session using the user's last known plan/cycle (or sensible defaults)
      const rawPlan = (metadata.plan_slug as string | undefined) ?? planSlugForTier((metadata.subscription_tier as string | undefined) ?? "free");
      const planSlug = normalizePlanSlug(rawPlan) ?? "free";
      const billingCycle = normalizeBillingCycle((metadata.billing_cycle as string | undefined) ?? "monthly") ?? "monthly";
      const priceId = getPriceIdForPlan(planSlug, billingCycle);
      if (!priceId) {
        // As a last resort, send the user to pricing
        return json({ url: `${normalizedBase}/pricing?from=stripe_portal` });
      }
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        success_url: `${normalizedBase}/account?from=stripe_checkout_success`,
        cancel_url: `${normalizedBase}/pricing?from=stripe_checkout_cancel`,
        billing_address_collection: "auto",
        allow_promotion_codes: true,
        payment_method_types: ["card"],
        subscription_data: {
          metadata: {
            plan_slug: planSlug,
            billing_cycle: billingCycle,
            user_id: user.id,
          },
        },
        metadata: {
          plan_slug: planSlug,
          billing_cycle: billingCycle,
          user_id: user.id,
        },
        line_items: [{ price: priceId, quantity: 1 }],
      });
      if (!checkout.url) throw portalError;
      return json({ url: checkout.url });
    }
  } catch (error) {
    return internalError(error);
  }
});

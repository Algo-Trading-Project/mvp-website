import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  ensureStripeCustomerId,
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

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

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

  if (!stripe) {
    return internalError("Stripe is not configured");
  }

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

    const customerId = await ensureStripeCustomerId(stripe, user, metadata, { persist: false });

    const successUrl = coerceUrl(
      payload.success_url,
      `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/pricing?status=success`,
    );
    const cancelUrl = coerceUrl(
      payload.cancel_url,
      `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/pricing?status=cancel`,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      subscription_data: {
        metadata: {
          plan_slug: planSlug,
          billing_cycle: billingCycleNormalized,
          user_id: user.id,
        },
      },
      metadata: {
        plan_slug: planSlug,
        billing_cycle: billingCycleNormalized,
        user_id: user.id,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return json({ url: session.url });
  } catch (error) {
    return internalError(error);
  }
});

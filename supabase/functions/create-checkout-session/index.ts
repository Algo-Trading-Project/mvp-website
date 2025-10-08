import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { json, badRequest, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set. create-checkout-session will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
    })
  : null;

const priceMap: Record<string, string | undefined> = {
  signals_lite_monthly: Deno.env.get("STRIPE_PRICE_SIGNALS_LITE_MONTHLY"),
  signals_lite_annual: Deno.env.get("STRIPE_PRICE_SIGNALS_LITE_ANNUAL"),
  signals_pro_monthly: Deno.env.get("STRIPE_PRICE_SIGNALS_PRO_MONTHLY"),
  signals_pro_annual: Deno.env.get("STRIPE_PRICE_SIGNALS_PRO_ANNUAL"),
  signals_api_monthly: Deno.env.get("STRIPE_PRICE_SIGNALS_API_MONTHLY"),
  signals_api_annual: Deno.env.get("STRIPE_PRICE_SIGNALS_API_ANNUAL"),
};

const defaultOrigin = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!stripe) {
    return json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch (error) {
    console.error("Invalid JSON body", error);
    return badRequest("Invalid JSON payload");
  }

  const planSlug = String(payload.plan_slug ?? "").trim();
  const billingCycle = String(payload.billing_cycle ?? "monthly").toLowerCase();
  const successUrl = String(payload.success_url ?? "");
  const cancelUrl = String(payload.cancel_url ?? "");

  if (!planSlug) {
    return badRequest("plan_slug is required");
  }

  const key = `${planSlug}_${billingCycle}`;
  const priceId = priceMap[key];

  if (!priceId) {
    return badRequest("Unsupported plan or billing cycle");
  }

  const origin = req.headers.get("origin") ?? defaultOrigin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: user.email ?? undefined,
      success_url: successUrl || `${origin}/pricing?status=success`,
      cancel_url: cancelUrl || `${origin}/pricing?status=cancel`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_slug: planSlug,
          billing_cycle: billingCycle,
        },
      },
      metadata: {
        user_id: user.id,
        plan_slug: planSlug,
        billing_cycle: billingCycle,
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a session URL");
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session failed", error);
    return internalError(error);
  }
});

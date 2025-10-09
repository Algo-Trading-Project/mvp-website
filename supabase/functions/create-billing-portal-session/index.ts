import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { json, badRequest, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const defaultOrigin = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-billing-portal-session will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!stripe) {
    return json({ error: "Stripe not configured" }, { status: 500 });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_err) {
    // optional payload
  }

  const returnUrl = String(payload.return_url ?? "");

  const metadata =
    (user.user_metadata as Record<string, unknown> | undefined) ??
    (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  const stripeCustomerId = (metadata.stripe_customer_id as string | undefined) ?? null;

  if (!stripeCustomerId) {
    return badRequest("Stripe customer not linked to this account.");
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl || `${defaultOrigin}/account`,
    });

    if (!session.url) {
      throw new Error("Billing portal session did not return a URL");
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Billing portal session failed", error);
    return internalError(error);
  }
});

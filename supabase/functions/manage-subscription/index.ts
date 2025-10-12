import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  ensureStripeCustomerId,
  extractSubscriptionSnapshot,
  normalizePlanSlug,
  normalizeBillingCycle,
  updateUserFromSubscription,
  syncUserMetadataFromStripe,
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; manage-subscription will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

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

  if (!stripe) {
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

  const metadata =
    (user.user_metadata as Record<string, unknown> | undefined) ??
    (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  try {
    const customerId = await ensureStripeCustomerId(stripe, user, metadata);

    const existingSubscriptionId = typeof metadata.stripe_subscription_id === "string" ? metadata.stripe_subscription_id : null;

    const subscription =
      (await syncUserMetadataFromStripe(stripe, user.id, customerId)) ??
      (await tryResolveSubscription(customerId, existingSubscriptionId));

    if (!subscription) {
      const metadataPatch = await updateUserFromSubscription({
        userId: user.id,
        subscription: null,
        planSlug: "free",
        billingCycle: "monthly",
        statusOverride: "canceled",
        supabaseUser: user,
        existingMetadata: metadata,
      });

      return json({
        subscription: {
          plan_slug: metadataPatch?.plan_slug ?? "free",
          billing_cycle: metadataPatch?.billing_cycle ?? "monthly",
          status: metadataPatch?.subscription_status ?? "canceled",
        },
        message: "Subscription status refreshed. No active subscription found.",
      });
    }

    const snapshot = extractSubscriptionSnapshot(subscription);
    const normalizedPlan = normalizePlanSlug(snapshot?.planSlug ?? "free") ?? "free";
    const normalizedCycle = normalizeBillingCycle(snapshot?.billingCycle ?? "monthly") ?? "monthly";

    await updateUserFromSubscription({
      userId: user.id,
      subscription,
      supabaseUser: user,
      existingMetadata: metadata,
      planSlug: normalizedPlan,
      billingCycle: normalizedCycle,
      statusOverride: subscription.status ?? undefined,
    });

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

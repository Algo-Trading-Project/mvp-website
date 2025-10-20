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
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; manage-subscription will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

type Action = "refresh" | "reset";

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

  if (action !== "refresh" && action !== "reset") {
    return badRequest("Unsupported action.");
  }

  try {
    const metadata =
      (user.user_metadata as Record<string, unknown> | undefined) ??
      (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const customerId = await ensureStripeCustomerId(stripe, user, metadata, { persist: false });

    if (action === "reset") {
      // Cancel any active/pending subscriptions and schedules, then reset auth/users metadata to Free/Monthly
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
        for (const sub of subs.data) {
          try { await stripe.subscriptions.cancelPendingUpdate(sub.id); } catch (_) {}
          // @ts-ignore schedule can be string|object|null
          const scheduleId: string | null = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
          if (scheduleId) { try { await stripe.subscriptionSchedules.cancel(scheduleId); } catch (_) {} }
          if (sub.status !== "canceled") {
            try { await stripe.subscriptions.cancel(sub.id); } catch (e) { console.warn("Cancel subscription failed", sub.id, e); }
          }
        }
      } catch (e) {
        console.warn("Failed to enumerate subscriptions during reset", e);
      }

      await updateUserFromSubscription({
        userId: user.id,
        subscription: null,
        planSlug: "free",
        billingCycle: "monthly",
        statusOverride: "active",
        supabaseUser: user,
        // Use an empty metadata source so old values (e.g., stripe_subscription_id, status, period end) don't stick
        existingMetadata: {},
        pendingPlanSlug: null,
        pendingBillingCycle: null,
        pendingEffectiveDate: null,
        pendingScheduleId: null,
        // Set far-future default so UI shows N/A for Next renewal
        currentPeriodEndOverride: "9999-12-31T00:00:00Z",
      });

      return json({ message: "Subscription reset to Free/Monthly; Stripe subscriptions canceled." });
    }

    const existingSubscriptionId =
      typeof metadata.stripe_subscription_id === "string" ? metadata.stripe_subscription_id : null;

    const subscription = await tryResolveSubscription(customerId, existingSubscriptionId);

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

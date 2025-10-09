import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { json, badRequest, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getPriceIdForPlan, persistStripeCustomerId, updateUserFromSubscription } from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; manage-subscription will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

const statusPriority: Record<string, number> = {
  active: 6,
  trialing: 5,
  past_due: 4,
  incomplete: 3,
  incomplete_expired: 2,
  canceled: 1,
};

const selectBestSubscription = (subscriptions: Stripe.ApiList<Stripe.Subscription>) => {
  if (!subscriptions?.data?.length) return null;
  const sorted = [...subscriptions.data].sort((a, b) => {
    const priorityDiff = (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (b.created ?? 0) - (a.created ?? 0);
  });
  return sorted[0] ?? null;
};

const ensureStripeCustomerId = async (
  user: Record<string, any>,
  metadata: Record<string, unknown>,
) => {
  const existingId = (metadata.stripe_customer_id as string | undefined) ?? null;
  if (existingId) return existingId;
  if (!stripe) throw new Error("Stripe client unavailable");
  const email = (user.email ?? "").toLowerCase();
  if (!email) {
    throw new Error("Unable to infer customer email");
  }
  const matches = await stripe.customers.list({ email, limit: 20 });
  const located = matches.data.find((candidate) => (candidate.email ?? "").toLowerCase() === email);
  if (located?.id) {
    await persistStripeCustomerId(user.id, located.id);
    return located.id;
  }
  const created = await stripe.customers.create({
    email,
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.full_name ??
      undefined,
    metadata: { supabase_user_id: user.id },
  });
  await persistStripeCustomerId(user.id, created.id);
  return created.id;
};

const retrieveSubscription = async (subscriptionId: string | null, customerId: string) => {
  if (!stripe) return null;
  if (subscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.warn("Unable to retrieve subscription by id", subscriptionId, error);
    }
  }
  try {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    return selectBestSubscription(subscriptions);
  } catch (error) {
    console.warn("Unable to list subscriptions for customer", customerId, error);
    return null;
  }
};

const summarizeSubscription = (subscription: Stripe.Subscription | null) => {
  if (!subscription) return null;
  return {
    id: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
    current_period_start: subscription.current_period_start ? subscription.current_period_start * 1000 : null,
    plan_slug: subscription.metadata?.plan_slug ?? null,
    billing_cycle: subscription.metadata?.billing_cycle ?? null,
  };
};

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
    // ignore
  }

  const actionRaw = String(payload.action ?? "").toLowerCase();
  if (!actionRaw) {
    return badRequest("action is required");
  }

  const metadata =
    (user.user_metadata as Record<string, unknown> | undefined) ??
    (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  const stripeCustomerId = await ensureStripeCustomerId(user, metadata);
  const stripeSubscriptionId = (metadata.stripe_subscription_id as string | undefined) ?? null;

  let subscription = await retrieveSubscription(stripeSubscriptionId, stripeCustomerId);
  if (!subscription) {
    return badRequest("No active subscription found for this account");
  }

  try {
    if (actionRaw === "cancel") {
      const cancelImmediately = Boolean(payload.cancel_now ?? false);
      subscription = cancelImmediately
        ? await stripe.subscriptions.cancel(subscription.id)
        : await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
    } else if (actionRaw === "resume") {
      if (!subscription.cancel_at_period_end) {
        return json({ subscription: summarizeSubscription(subscription), message: "Subscription already active" });
      }
      subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
    } else if (actionRaw === "change_plan") {
      const planSlug = String(payload.plan_slug ?? "").toLowerCase();
      const billingCycle = String(payload.billing_cycle ?? "monthly").toLowerCase();
      if (planSlug === "free") {
        subscription = await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
          metadata: {
            ...(subscription.metadata ?? {}),
            plan_slug: planSlug,
            billing_cycle: billingCycle,
          },
        });
      } else {
        const priceId = getPriceIdForPlan(planSlug, billingCycle);
        if (!priceId) {
          return badRequest("Unsupported plan or billing cycle");
        }
        const prorationBehavior = (payload.proration_behavior as Stripe.SubscriptionUpdateParams.ProrationBehavior) ??
          "create_prorations";
        const items = subscription.items?.data ?? [];
        if (!items.length) {
          return internalError("Subscription has no items to update");
        }
        const targetItem = items[0];
        subscription = await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
          proration_behavior: prorationBehavior,
          items: [
            {
              id: targetItem.id,
              price: priceId,
            },
          ],
          metadata: {
            ...(subscription.metadata ?? {}),
            plan_slug: planSlug,
            billing_cycle: billingCycle,
          },
        });
      }
    } else {
      return badRequest("Unsupported action");
    }

    const inferred = derivePlanInfoFromSubscription(subscription);
    await updateUserFromSubscription({
      userId: user.id,
      subscription,
      planSlug: inferred.planSlug ?? undefined,
      billingCycle: inferred.billingCycle ?? undefined,
      statusOverride: subscription.status,
    });

    return json({
      subscription: summarizeSubscription(subscription),
      message: "Subscription updated",
    });
  } catch (error) {
    console.error("manage-subscription failed", error);
    return internalError(error);
  }
});

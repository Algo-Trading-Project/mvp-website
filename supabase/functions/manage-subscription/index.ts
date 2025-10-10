import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { json, badRequest, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import {
  derivePlanInfoFromSubscription,
  getPriceIdForPlan,
  persistStripeCustomerId,
  updateUserFromSubscription,
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; manage-subscription will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";
const subscriptionExpand = ["items.data.price", "items.data.price.product"];

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
      return await stripe.subscriptions.retrieve(subscriptionId, { expand: subscriptionExpand });
    } catch (error) {
      console.warn("Unable to retrieve subscription by id", subscriptionId, error);
    }
  }
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
      expand: subscriptionExpand,
    });
    return selectBestSubscription(subscriptions);
  } catch (error) {
    console.warn("Unable to list subscriptions for customer", customerId, error);
    return null;
  }
};

const metaStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const metaDateToMillis = (value: unknown) => {
  const normalized = metaStringOrNull(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

const summarizeSubscription = (subscription: Stripe.Subscription | null) => {
  if (!subscription) return null;
  const pendingPlanSlug = metaStringOrNull(subscription.metadata?.pending_plan_slug);
  return {
    id: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
    current_period_start: subscription.current_period_start ? subscription.current_period_start * 1000 : null,
    plan_slug: subscription.metadata?.plan_slug ?? null,
    billing_cycle: subscription.metadata?.billing_cycle ?? null,
    pending_plan_slug: pendingPlanSlug,
    pending_billing_cycle: metaStringOrNull(subscription.metadata?.pending_billing_cycle),
    pending_effective_date: metaDateToMillis(subscription.metadata?.pending_effective_date),
    pending_schedule_id: metaStringOrNull(subscription.metadata?.pending_schedule_id),
    schedule_id: typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id ?? null,
  };
};

const computeComparableAmount = (price: Stripe.Price | null | undefined) => {
  if (!price) return null;
  if (typeof price.unit_amount !== "number") return null;
  const interval = price.recurring?.interval ?? "month";
  const intervalCount = price.recurring?.interval_count ?? 1;
  if (!intervalCount || intervalCount <= 0) return price.unit_amount;
  if (interval === "year") {
    return price.unit_amount / intervalCount / 12;
  }
  if (interval === "week") {
    return price.unit_amount / intervalCount * (7 / 30);
  }
  if (interval === "day") {
    return price.unit_amount / intervalCount * (1 / 30);
  }
  return price.unit_amount / intervalCount;
};

const fetchPriceById = async (priceId: string | null | undefined) => {
  if (!priceId || !stripe) return null;
  try {
    return await stripe.prices.retrieve(priceId, { expand: ["product"] });
  } catch (error) {
    console.warn("Failed to fetch price", priceId, error);
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

  let responseMessage = "Subscription updated";

  try {
    if (actionRaw === "cancel") {
      const cancelImmediately = Boolean(payload.cancel_now ?? false);
      subscription = cancelImmediately
        ? await stripe.subscriptions.cancel(subscription.id, { expand: subscriptionExpand })
        : await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: true,
            expand: subscriptionExpand,
          });
      responseMessage = cancelImmediately ? "Subscription canceled" : "Cancellation scheduled";
    } else if (actionRaw === "resume") {
      if (!subscription.cancel_at_period_end) {
        return json({ subscription: summarizeSubscription(subscription), message: "Subscription already active" });
      }
      subscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        expand: subscriptionExpand,
      });
      responseMessage = "Subscription resumed";
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
        responseMessage = "Cancellation scheduled";
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
        const currentItem = items[0];
        const currentPrice =
          (currentItem.price as Stripe.Price | undefined) ?? (await fetchPriceById(currentItem.price?.id));
        const targetPrice = await fetchPriceById(priceId);
        const currentComparable = computeComparableAmount(currentPrice);
        const targetComparable = computeComparableAmount(targetPrice);
        const isUpgrade =
          targetComparable !== null &&
          (currentComparable === null || targetComparable > currentComparable);
        if (isUpgrade) {
          const pendingEffectiveIso = new Date().toISOString();
          await stripe.subscriptions.update(subscription.id, {
            metadata: {
              ...(subscription.metadata ?? {}),
              pending_plan_slug: planSlug,
              pending_billing_cycle: billingCycle,
              pending_effective_date: pendingEffectiveIso,
              pending_schedule_id: "",
            },
            expand: subscriptionExpand,
          });
          const upgradeReturnUrl = String(payload.upgrade_return_url ?? payload.success_url ?? SITE_URL);
          const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: upgradeReturnUrl || SITE_URL,
            flow_data: {
              type: "subscription_update",
              subscription_update: {
                subscription: subscription.id,
                items: [{ price: priceId, quantity: 1 }],
                proration_behavior: "create_prorations",
                allow_promotion_codes: true,
              },
            },
          });
          if (!session?.url) {
            return internalError("Stripe portal session unavailable for upgrade");
          }
          return json({
            subscription: summarizeSubscription(subscription),
            redirect_url: session.url,
            requires_action: "redirect_to_stripe",
            message: "Complete the upgrade in Stripe to finish.",
          });
        }
        subscription = await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
          proration_behavior: prorationBehavior,
          items: [
            {
              id: currentItem.id,
              price: priceId,
            },
          ],
          metadata: {
            ...(subscription.metadata ?? {}),
            plan_slug: planSlug,
            billing_cycle: billingCycle,
            pending_plan_slug: "",
            pending_billing_cycle: "",
            pending_effective_date: "",
            pending_schedule_id: "",
          },
          expand: subscriptionExpand,
        });
        responseMessage = "Subscription updated";
      }
    } else if (actionRaw === "schedule_downgrade") {
      const planSlug = String(payload.plan_slug ?? "").toLowerCase();
      const billingCycle = String(payload.billing_cycle ?? "monthly").toLowerCase();
      const priceId = getPriceIdForPlan(planSlug, billingCycle);
      if (!priceId) {
        return badRequest("Unsupported plan or billing cycle");
      }
      const currentItem = subscription.items?.data?.[0];
      if (!currentItem?.price?.id) {
        return internalError("Unable to locate current subscription price for scheduling downgrade");
      }
      if (!subscription.current_period_end) {
        return internalError("Subscription missing current period end for scheduling downgrade");
      }
      const scheduleIdRaw = subscription.schedule
        ? (typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id)
        : null;
      let schedule: Stripe.SubscriptionSchedule;
      if (scheduleIdRaw) {
        schedule = await stripe.subscriptionSchedules.retrieve(scheduleIdRaw);
      } else {
        schedule = await stripe.subscriptionSchedules.create({
          from_subscription: subscription.id,
        });
      }
      const existingPhases = schedule.phases ?? [];
      const scheduleStart = schedule.start_date ?? subscription.current_period_start ?? null;
      const currentPhaseStart = existingPhases[0]?.start_date ?? scheduleStart ?? null;

      const currentPhase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
        items: [{ price: currentItem.price.id, quantity: 1 }],
        proration_behavior: "none",
        end_date: subscription.current_period_end,
        metadata: {
          ...(subscription.metadata ?? {}),
        },
      };
      if (currentPhaseStart) {
        currentPhase.start_date = currentPhaseStart;
      }

      const nextPhase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
        items: [{ price: priceId, quantity: 1 }],
        proration_behavior: "none",
        metadata: {
          plan_slug: planSlug,
          billing_cycle: billingCycle,
        },
      };
      if (subscription.current_period_end) {
        nextPhase.start_date = subscription.current_period_end;
      }

      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        proration_behavior: "none",
        phases: [currentPhase, nextPhase],
      });
      const pendingEffectiveIso = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : "";
      subscription = await stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...(subscription.metadata ?? {}),
          pending_plan_slug: planSlug,
          pending_billing_cycle: billingCycle,
          pending_effective_date: pendingEffectiveIso,
          pending_schedule_id: schedule.id,
        },
        expand: subscriptionExpand,
      });
      responseMessage = "Downgrade scheduled";
    } else if (actionRaw === "cancel_scheduled_change") {
      const pendingScheduleId =
        metaStringOrNull(subscription.metadata?.pending_schedule_id) ??
        (typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule?.id ?? null);
      if (pendingScheduleId && stripe) {
        try {
          await stripe.subscriptionSchedules.release(pendingScheduleId);
        } catch (releaseError) {
          console.warn("Unable to release subscription schedule", pendingScheduleId, releaseError);
          try {
            await stripe.subscriptionSchedules.cancel(pendingScheduleId);
          } catch (cancelError) {
            console.warn("Unable to cancel subscription schedule", pendingScheduleId, cancelError);
          }
        }
      }
      subscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        metadata: {
          ...(subscription.metadata ?? {}),
          pending_plan_slug: "",
          pending_billing_cycle: "",
          pending_effective_date: "",
          pending_schedule_id: "",
        },
        expand: subscriptionExpand,
      });
      responseMessage = "Scheduled change canceled";
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
      message: responseMessage,
    });
  } catch (error) {
    console.error("manage-subscription failed", error);
    return internalError(error);
  }
});

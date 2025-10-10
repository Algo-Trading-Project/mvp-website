import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getServiceSupabaseClient } from "./supabase.ts";

export const PLAN_TIER_MAP: Record<string, string> = {
  signals_pro: "pro",
  signals_api: "api",
  signals_lite: "lite",
  free: "free",
};

type PriceMapping = {
  planSlug: string;
  billingCycle: string;
};

const PRICE_PLAN_MAP: Record<string, PriceMapping> = {};
const PLAN_PRICE_MAP: Record<string, string> = {};

const normalizeKey = (value: string) => value.toLowerCase();

const registerPrice = (envKey: string, planSlug: string, billingCycle: string) => {
  const normalizedPlanSlug = normalizeKey(planSlug);
  const normalizedCycle = normalizeKey(billingCycle);
  const priceId = Deno.env.get(envKey);
  if (priceId) {
    PRICE_PLAN_MAP[priceId] = { planSlug: normalizedPlanSlug, billingCycle: normalizedCycle };
    PLAN_PRICE_MAP[`${normalizedPlanSlug}_${normalizedCycle}`] = priceId;
  }
};

registerPrice("STRIPE_PRICE_SIGNALS_LITE_MONTHLY", "signals_lite", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_LITE_ANNUAL", "signals_lite", "annual");
registerPrice("STRIPE_PRICE_SIGNALS_PRO_MONTHLY", "signals_pro", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_PRO_ANNUAL", "signals_pro", "annual");
registerPrice("STRIPE_PRICE_SIGNALS_API_MONTHLY", "signals_api", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_API_ANNUAL", "signals_api", "annual");

export const getTrackedPriceIds = () => Object.keys(PRICE_PLAN_MAP);
export const getPriceIdForPlan = (planSlug?: string | null, billingCycle?: string | null) => {
  if (!planSlug || !billingCycle) return null;
  return PLAN_PRICE_MAP[`${normalizeKey(planSlug)}_${normalizeKey(billingCycle)}`] ?? null;
};

export const normalizePlanSlug = (planSlug?: string | null) => {
  if (!planSlug) return null;
  const normalized = normalizeKey(planSlug);
  return PLAN_TIER_MAP[normalized] ? normalized : normalized;
};

export const normalizeBillingCycle = (billingCycle?: string | null) => {
  if (!billingCycle) return null;
  return billingCycle.toLowerCase();
};

const metadataStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const derivePlanInfoFromSubscription = (subscription: Stripe.Subscription) => {
  let planSlug =
    normalizePlanSlug(subscription.metadata?.plan_slug) ??
    normalizePlanSlug(subscription.items?.data?.[0]?.price?.metadata?.plan_slug);

  let billingCycle =
    normalizeBillingCycle(subscription.metadata?.billing_cycle) ??
    normalizeBillingCycle(subscription.items?.data?.[0]?.price?.metadata?.billing_cycle);

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  if (priceId && PRICE_PLAN_MAP[priceId]) {
    const mapping = PRICE_PLAN_MAP[priceId];
    if (!planSlug) {
      planSlug = mapping.planSlug;
    }
    if (!billingCycle) {
      billingCycle = mapping.billingCycle;
    }
  }

  if (!billingCycle) {
    const recurringInterval = subscription.items?.data?.[0]?.price?.recurring?.interval ?? null;
    if (recurringInterval) {
      billingCycle = normalizeBillingCycle(recurringInterval);
    }
  }

  return {
    planSlug: planSlug ?? null,
    billingCycle: billingCycle ?? null,
  };
};

export interface UpdateUserFromSubscriptionOptions {
  userId: string;
  planSlug?: string | null;
  billingCycle?: string | null;
  subscription?: Stripe.Subscription | null;
  statusOverride?: string | null;
}

const toIsoString = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Date(value * 1000).toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
};

export const updateUserFromSubscription = async (options: UpdateUserFromSubscriptionOptions) => {
  const { userId, subscription, statusOverride } = options;
  const planSlugInput = normalizePlanSlug(options.planSlug);
  const billingCycleInput = normalizeBillingCycle(options.billingCycle);

  const supabase = getServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    console.error("Unable to fetch user for subscription update", userError);
    return;
  }

  const existingMeta =
    (userData.user.user_metadata as Record<string, unknown> | undefined) ??
    (userData.user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  const subscriptionStatus =
    statusOverride ?? subscription?.status ?? (existingMeta.subscription_status as string | null) ?? "active";

  const updates: Record<string, unknown> = {
    subscription_status: subscriptionStatus,
    subscription_cancel_at_period_end: subscription?.cancel_at_period_end ?? existingMeta.subscription_cancel_at_period_end ?? false,
  };

  if (planSlugInput) {
    updates.subscription_tier = PLAN_TIER_MAP[planSlugInput] ?? planSlugInput;
  } else if (!subscription) {
    updates.subscription_tier = "free";
  }

  if (billingCycleInput) {
    updates.billing_cycle = billingCycleInput;
  }

  if (subscription) {
    updates.plan_started_at = toIsoString(subscription.current_period_start) ?? existingMeta.plan_started_at ?? null;
    updates.current_period_end = toIsoString(subscription.current_period_end) ?? existingMeta.current_period_end ?? null;
    updates.stripe_subscription_id = subscription.id;
    updates.stripe_customer_id =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? existingMeta.stripe_customer_id ?? null;
    const pendingPlan = metadataStringOrNull(subscription.metadata?.pending_plan_slug);
    const pendingBilling = metadataStringOrNull(subscription.metadata?.pending_billing_cycle);
    const pendingEffectiveRaw = metadataStringOrNull(subscription.metadata?.pending_effective_date);
    const pendingScheduleId = metadataStringOrNull(subscription.metadata?.pending_schedule_id);
    updates.subscription_pending_plan_slug = pendingPlan ?? null;
    updates.subscription_pending_billing_cycle = pendingBilling ?? null;
    updates.subscription_pending_effective_date = pendingEffectiveRaw ? toIsoString(pendingEffectiveRaw) : null;
    updates.subscription_pending_schedule_id = pendingScheduleId ?? null;
  } else if (statusOverride) {
    updates.stripe_subscription_id = null;
    updates.current_period_end = new Date().toISOString();
    updates.subscription_pending_plan_slug = null;
    updates.subscription_pending_billing_cycle = null;
    updates.subscription_pending_effective_date = null;
    updates.subscription_pending_schedule_id = null;
  }

  const mergedMetadata = { ...existingMeta, ...updates };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: mergedMetadata,
  });

  if (updateError) {
    console.error("Failed to persist subscription metadata", updateError, updates);
  }

  try {
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      email: userData.user.email ?? existingMeta.email ?? null,
      subscription_tier: mergedMetadata.subscription_tier ?? null,
      subscription_status: mergedMetadata.subscription_status ?? null,
      current_period_end: mergedMetadata.current_period_end ?? null,
      plan_started_at: mergedMetadata.plan_started_at ?? null,
      billing_cycle: mergedMetadata.billing_cycle ?? null,
      stripe_customer_id: mergedMetadata.stripe_customer_id ?? null,
      stripe_subscription_id: mergedMetadata.stripe_subscription_id ?? null,
      subscription_pending_plan_slug: mergedMetadata.subscription_pending_plan_slug ?? null,
      subscription_pending_billing_cycle: mergedMetadata.subscription_pending_billing_cycle ?? null,
      subscription_pending_effective_date: mergedMetadata.subscription_pending_effective_date ?? null,
      subscription_pending_schedule_id: mergedMetadata.subscription_pending_schedule_id ?? null,
    };

    const { error: upsertError } = await supabase.from("users").upsert(upsertPayload, {
      onConflict: "user_id",
    });

    if (upsertError) {
      console.warn("Failed to sync metadata into users table", upsertError);
    }
  } catch (tableError) {
    console.warn("Users table sync unavailable", tableError);
  }
};

export const persistStripeCustomerId = async (userId: string, stripeCustomerId: string) => {
  const supabase = getServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    console.error("Unable to fetch user while persisting stripe_customer_id", userError);
    return;
  }

  const existingMeta =
    (userData.user.user_metadata as Record<string, unknown> | undefined) ??
    (userData.user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  if (existingMeta.stripe_customer_id === stripeCustomerId) {
    return;
  }

  const mergedMetadata = {
    ...existingMeta,
    stripe_customer_id: stripeCustomerId,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: mergedMetadata,
  });

  if (updateError) {
    console.error("Failed to persist stripe_customer_id metadata", updateError);
  }

  try {
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      email: userData.user.email ?? existingMeta.email ?? null,
      stripe_customer_id: stripeCustomerId,
    };
    const { error: upsertError } = await supabase.from("users").upsert(upsertPayload, {
      onConflict: "user_id",
    });
    if (upsertError) {
      console.warn("Failed to persist stripe_customer_id in users table", upsertError);
    }
  } catch (tableError) {
    console.warn("Users table sync unavailable for stripe_customer_id", tableError);
  }
};

export const syncUserMetadataFromStripe = async (userId: string, stripe: Stripe, customerId?: string | null) => {
  try {
    const supabase = getServiceSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("Unable to fetch user for metadata sync", userError);
      return null;
    }
    const existingMeta =
      (userData.user.user_metadata as Record<string, unknown> | undefined) ??
      (userData.user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const stripeSubscriptionId = existingMeta.stripe_subscription_id as string | undefined;
    let subscription: Stripe.Subscription | null = null;

    try {
      if (stripeSubscriptionId) {
        subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      } else if (customerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 20,
        });
        subscription = subscriptions.data.find((item) => item.status !== "canceled") ?? subscriptions.data[0] ?? null;
      }
    } catch (error) {
      console.warn("Unable to retrieve subscription during metadata sync", error);
    }

    if (!subscription) {
      if (customerId) {
        await updateUserFromSubscription({
          userId,
          subscription: null,
          planSlug: "signals_lite",
          billingCycle: "monthly",
          statusOverride: "canceled",
        });
      }
      return null;
    }

    const derived = derivePlanInfoFromSubscription(subscription);
    await updateUserFromSubscription({
      userId,
      subscription,
      planSlug: derived.planSlug ?? undefined,
      billingCycle: derived.billingCycle ?? undefined,
      statusOverride: subscription.status,
    });
    return subscription;
  } catch (error) {
    console.error("syncUserMetadataFromStripe failed", error);
    return null;
  }
};

import type Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import type { User as SupabaseAuthUser } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceSupabaseClient } from "./supabase.ts";

export const PLAN_TIER_MAP: Record<string, string> = {
  signals_lite: "lite",
  signals_pro: "pro",
  signals_api: "api",
  free: "free",
};

const TIER_PLAN_MAP: Record<string, string> = {
  free: "free",
  lite: "signals_lite",
  pro: "signals_pro",
  api: "signals_api",
};

type PriceMapping = {
  planSlug: string;
  billingCycle: string;
};

const PRICE_PLAN_MAP: Record<string, PriceMapping> = {};
const PLAN_PRICE_MAP: Record<string, string> = {};

const normalizeKey = (value: string) => value.toLowerCase();

const registerPrice = (envKey: string, planSlug: string, billingCycle: string) => {
  const priceId = Deno.env.get(envKey);
  if (!priceId) return;
  const normalizedPlan = normalizeKey(planSlug);
  const normalizedCycle = normalizeKey(billingCycle);
  PRICE_PLAN_MAP[priceId] = { planSlug: normalizedPlan, billingCycle: normalizedCycle };
  PLAN_PRICE_MAP[`${normalizedPlan}_${normalizedCycle}`] = priceId;
};

registerPrice("STRIPE_PRICE_SIGNALS_LITE_MONTHLY", "signals_lite", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_LITE_ANNUAL", "signals_lite", "annual");
registerPrice("STRIPE_PRICE_SIGNALS_PRO_MONTHLY", "signals_pro", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_PRO_ANNUAL", "signals_pro", "annual");
registerPrice("STRIPE_PRICE_SIGNALS_API_MONTHLY", "signals_api", "monthly");
registerPrice("STRIPE_PRICE_SIGNALS_API_ANNUAL", "signals_api", "annual");

export const getTrackedPriceIds = () => Object.keys(PRICE_PLAN_MAP);

export const getPlanInfoForPriceId = (priceId?: string | null) => {
  if (!priceId) return null;
  return PRICE_PLAN_MAP[priceId] ?? null;
};

export const getPriceIdForPlan = (planSlug?: string | null, billingCycle?: string | null) => {
  if (!planSlug || !billingCycle) return null;
  return PLAN_PRICE_MAP[`${normalizeKey(planSlug)}_${normalizeKey(billingCycle)}`] ?? null;
};

const normalizeValueOrEmpty = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizePlanSlug = (planSlug?: string | null) => {
  if (!planSlug) return null;
  const normalized = normalizeKey(planSlug);
  return PLAN_TIER_MAP[normalized] ? normalized : normalized;
};

export const normalizeBillingCycle = (billingCycle?: string | null) => {
  if (!billingCycle) return null;
  const normalized = billingCycle.toLowerCase();
  return normalized === "annual" ? "annual" : "monthly";
};

export const planSlugForTier = (tier?: string | null) => {
  const normalizedTier = normalizeKey(tier ?? "free");
  return TIER_PLAN_MAP[normalizedTier] ?? "free";
};

export const tierFromPlanSlug = (slug?: string | null) => {
  const normalizedSlug = normalizePlanSlug(slug) ?? "free";
  return PLAN_TIER_MAP[normalizedSlug] ?? "free";
};

const metadataStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

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

const selectNextSchedulePhase = (schedule: Stripe.SubscriptionSchedule | null | undefined) => {
  if (!schedule) return null;
  const phases = schedule.phases ?? [];
  if (!phases.length) return null;
  const currentPhaseEnd = schedule.current_phase?.end_date ?? Math.floor(Date.now() / 1000);
  const candidates = phases
    .filter((phase) => (phase.start_date ?? 0) >= currentPhaseEnd)
    .sort((a, b) => (a.start_date ?? 0) - (b.start_date ?? 0));
  if (candidates.length > 0) {
    return candidates[0];
  }
  return phases[phases.length - 1];
};

const resolvePendingFromPhase = (phase: Stripe.SubscriptionSchedule.Phase | null | undefined) => {
  if (!phase) {
    return { planSlug: null, billingCycle: null, effectiveDate: null };
  }
  const rawPlan =
    metadataStringOrNull(phase.metadata?.plan_slug) ??
    metadataStringOrNull(phase.metadata?.pending_plan_slug);
  const rawCycle =
    metadataStringOrNull(phase.metadata?.billing_cycle) ??
    metadataStringOrNull(phase.metadata?.pending_billing_cycle);
  const priceObjOrId = phase.items?.[0]?.price;
  const priceId = typeof priceObjOrId === "string" ? priceObjOrId : priceObjOrId?.id ?? null;
  const mapping = getPlanInfoForPriceId(priceId);
  // Try mapping → phase metadata → price metadata, in that order
  const priceMetaPlan =
    typeof priceObjOrId === "object" && priceObjOrId?.metadata
      ? metadataStringOrNull((priceObjOrId.metadata as Record<string, unknown>)?.plan_slug)
      : null;
  const priceMetaCycle =
    typeof priceObjOrId === "object" && priceObjOrId?.metadata
      ? metadataStringOrNull((priceObjOrId.metadata as Record<string, unknown>)?.billing_cycle)
      : null;

  const planSlug = normalizePlanSlug(mapping?.planSlug ?? rawPlan ?? priceMetaPlan) ?? null;
  const billingCycle =
    normalizeBillingCycle(
      mapping?.billingCycle ??
        rawCycle ??
        priceMetaCycle ??
        (typeof priceObjOrId === "object" ? priceObjOrId?.recurring?.interval ?? null : null),
    ) ?? null;
  const effectiveDate = phase.start_date ? toIsoString(phase.start_date) : null;
  return { planSlug, billingCycle, effectiveDate };
};

const resolvePendingFromSubscription = (subscription: Stripe.Subscription | null) => {
  if (!subscription) {
    return {
      planSlug: null,
      billingCycle: null,
      effectiveDate: null,
      scheduleId: null,
    };
  }

  const metadataPendingPlan = metadataStringOrNull(subscription.metadata?.pending_plan_slug);
  const metadataPendingCycle = metadataStringOrNull(subscription.metadata?.pending_billing_cycle);
  const metadataPendingEffective = metadataStringOrNull(subscription.metadata?.pending_effective_date);
  const metadataPendingSchedule = metadataStringOrNull(subscription.metadata?.pending_schedule_id);

  const schedule =
    typeof subscription.schedule === "object" && subscription.schedule
      ? (subscription.schedule as Stripe.SubscriptionSchedule)
      : null;
  const pendingFromSchedule = resolvePendingFromPhase(selectNextSchedulePhase(schedule));

  const planSlug =
    normalizePlanSlug(metadataPendingPlan ?? pendingFromSchedule.planSlug ?? null) ?? null;
  const billingCycle =
    normalizeBillingCycle(metadataPendingCycle ?? pendingFromSchedule.billingCycle ?? null) ?? null;
  const effectiveDate =
    metadataPendingEffective !== null && metadataPendingEffective !== undefined
      ? toIsoString(metadataPendingEffective)
      : pendingFromSchedule.effectiveDate;
  const scheduleId = metadataPendingSchedule ?? (schedule?.id ?? null);

  return {
    planSlug,
    billingCycle,
    effectiveDate,
    scheduleId,
  };
};

export interface SubscriptionSnapshot {
  planSlug: string | null;
  billingCycle: string | null;
  tier: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  planStartedAt: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanSlug: string | null;
  pendingBillingCycle: string | null;
  pendingEffectiveDate: string | null;
  pendingScheduleId: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

export const extractSubscriptionSnapshot = (
  subscription: Stripe.Subscription | null,
): SubscriptionSnapshot | null => {
  if (!subscription) return null;
  const inferred = derivePlanInfoFromSubscription(subscription);
  const pending = resolvePendingFromSubscription(subscription);
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  return {
    planSlug: normalizePlanSlug(inferred.planSlug) ?? null,
    billingCycle: normalizeBillingCycle(inferred.billingCycle) ?? null,
    tier: inferred.planSlug ? PLAN_TIER_MAP[inferred.planSlug] ?? inferred.planSlug : null,
    status: subscription.status ?? null,
    currentPeriodEnd: subscription.current_period_end ? toIsoString(subscription.current_period_end) : null,
    planStartedAt: subscription.current_period_start ? toIsoString(subscription.current_period_start) : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    pendingPlanSlug: pending.planSlug,
    pendingBillingCycle: pending.billingCycle,
    pendingEffectiveDate: pending.effectiveDate,
    pendingScheduleId: pending.scheduleId,
    stripeSubscriptionId: subscription.id ?? null,
    stripeCustomerId,
  };
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
    planSlug = mapping.planSlug;
    billingCycle = mapping.billingCycle;
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

export const buildSubscriptionSnapshotFromMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata) {
    return {
      planSlug: "free",
      billingCycle: "monthly",
      tier: "free",
      status: "trial",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pendingChange: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      pendingScheduleId: null,
      scheduleId: null,
    };
  }

  const tierValue = normalizeValueOrEmpty(metadata.subscription_tier ?? metadata.subscriptionTier ?? "free");
  const rawPlanSlug = metadata.plan_slug ?? metadata.planSlug;
  const planSlug = normalizePlanSlug(rawPlanSlug ? String(rawPlanSlug) : planSlugForTier(tierValue)) ?? "free";
  const billingCycleMeta = metadata.billing_cycle ?? metadata.billingCycle ?? "monthly";
  const billingCycle = normalizeBillingCycle(String(billingCycleMeta)) ?? "monthly";
  const pendingPlan = metadata.subscription_pending_plan_slug ?? metadata.pending_plan_slug;
  const pendingCycle = metadata.subscription_pending_billing_cycle ?? metadata.pending_billing_cycle;
  const pendingEffective = metadata.subscription_pending_effective_date ?? metadata.pending_effective_date;

  return {
    planSlug,
    billingCycle,
    tier: PLAN_TIER_MAP[planSlug] ?? planSlug,
    status: (metadata.subscription_status ?? metadata.subscriptionStatus ?? "trial") as string,
    currentPeriodEnd: metadata.current_period_end ? toIsoString(String(metadata.current_period_end)) : null,
    cancelAtPeriodEnd: Boolean(
      metadata.subscription_cancel_at_period_end ?? metadata.cancel_at_period_end ?? false,
    ),
    pendingChange: pendingPlan
      ? {
          planSlug: normalizePlanSlug(String(pendingPlan)) ?? "free",
          billingCycle: normalizeBillingCycle(String(pendingCycle)) ?? "monthly",
          effectiveDate: pendingEffective ? toIsoString(String(pendingEffective)) : null,
        }
      : null,
    stripeSubscriptionId: (metadata.stripe_subscription_id as string | undefined) ?? null,
    stripeCustomerId: (metadata.stripe_customer_id as string | undefined) ?? null,
    pendingScheduleId: (metadata.subscription_pending_schedule_id as string | undefined) ?? null,
    scheduleId: (metadata.subscription_schedule_id as string | undefined) ?? null,
  };
};

export const subscriptionSummaryToSnapshot = (
  summary: Record<string, unknown> | null | undefined,
  previousSnapshot: SubscriptionSnapshot | null = null,
) => {
  const fallback =
    previousSnapshot ??
    ({
      planSlug: "free",
      billingCycle: "monthly",
      tier: "free",
      status: "trial",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pendingChange: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      pendingScheduleId: null,
      scheduleId: null,
    } as SubscriptionSnapshot);

  if (!summary) {
    return fallback;
  }

  const planSlug = summary.plan_slug ? normalizePlanSlug(String(summary.plan_slug)) ?? fallback.planSlug : fallback.planSlug;
  const billingCycle = summary.billing_cycle
    ? normalizeBillingCycle(String(summary.billing_cycle)) ?? fallback.billingCycle
    : fallback.billingCycle;
  const pendingPlanSlug = summary.pending_plan_slug ? normalizePlanSlug(String(summary.pending_plan_slug)) : null;
  const pendingBillingCycle = summary.pending_billing_cycle
    ? normalizeBillingCycle(String(summary.pending_billing_cycle))
    : fallback.pendingChange?.billingCycle ?? "monthly";

  return {
    planSlug,
    billingCycle,
    tier: PLAN_TIER_MAP[planSlug] ?? planSlug,
    status: (summary.status ?? fallback.status) as string,
    currentPeriodEnd: summary.current_period_end ? toIsoString(String(summary.current_period_end)) : null,
    cancelAtPeriodEnd: Boolean(summary.cancel_at_period_end ?? fallback.cancelAtPeriodEnd),
    pendingChange: pendingPlanSlug
      ? {
          planSlug: pendingPlanSlug,
          billingCycle: pendingBillingCycle,
          effectiveDate: summary.pending_effective_date ? toIsoString(String(summary.pending_effective_date)) : null,
        }
      : null,
    stripeSubscriptionId: (summary.id as string | undefined) ?? fallback.stripeSubscriptionId ?? null,
    stripeCustomerId: fallback.stripeCustomerId ?? null,
    pendingScheduleId: (summary.pending_schedule_id as string | undefined) ?? fallback.pendingScheduleId ?? null,
    scheduleId: (summary.schedule_id as string | undefined) ?? fallback.scheduleId ?? null,
  };
};

export const buildMetadataPatchFromSummary = (summary: Record<string, unknown> | null | undefined) => {
  if (!summary) return {};
  const planSlug = summary.plan_slug ? String(summary.plan_slug) : null;
  const billingCycle = summary.billing_cycle ? String(summary.billing_cycle) : null;
  const pendingPlanSlug = summary.pending_plan_slug ? String(summary.pending_plan_slug) : null;
  const pendingBillingCycle = summary.pending_billing_cycle ? String(summary.pending_billing_cycle) : null;
  const pendingEffectiveDate = summary.pending_effective_date ? toIsoString(String(summary.pending_effective_date)) : null;

  return {
    subscription_tier: planSlug ? PLAN_TIER_MAP[normalizePlanSlug(planSlug) ?? planSlug] ?? "free" : undefined,
    plan_slug: planSlug,
    billing_cycle: billingCycle,
    subscription_status: summary.status ?? undefined,
    current_period_end: summary.current_period_end ? toIsoString(String(summary.current_period_end)) : null,
    subscription_cancel_at_period_end: Boolean(summary.cancel_at_period_end ?? false),
    subscription_pending_plan_slug: pendingPlanSlug,
    subscription_pending_billing_cycle: pendingBillingCycle,
    subscription_pending_effective_date: pendingEffectiveDate,
    subscription_pending_schedule_id: summary.pending_schedule_id ?? null,
    subscription_schedule_id: summary.schedule_id ?? null,
    stripe_subscription_id: summary.id ?? undefined,
  };
};

const deriveLatestInvoiceStatus = (subscription?: Stripe.Subscription | null) => {
  if (!subscription) return null;
  const invoice = subscription.latest_invoice;
  if (!invoice) return null;
  if (typeof invoice === "string") return null;
  return invoice.status ?? null;
};

export const normalizeSubscriptionStatusValue = (
  status: string | null | undefined,
  subscription?: Stripe.Subscription | null,
) => {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (normalized === "incomplete") {
    const invoiceStatus = deriveLatestInvoiceStatus(subscription);
    if (!invoiceStatus || invoiceStatus === "paid" || invoiceStatus === "void" || invoiceStatus === "uncollectible") {
      return "active";
    }
  }
  return normalized;
};

export interface UpdateUserFromSubscriptionOptions {
  userId: string;
  subscription?: Stripe.Subscription | null;
  planSlug?: string | null;
  billingCycle?: string | null;
  statusOverride?: string | null;
  pendingPlanSlug?: string | null;
  pendingBillingCycle?: string | null;
  pendingEffectiveDate?: string | null;
  pendingScheduleId?: string | null;
  supabaseUser?: SupabaseAuthUser | null;
  existingMetadata?: Record<string, unknown> | null;
}

export const updateUserFromSubscription = async (options: UpdateUserFromSubscriptionOptions) => {
  const { userId, subscription, supabaseUser, existingMetadata } = options;
  const supabase = getServiceSupabaseClient();

  let authUser: SupabaseAuthUser | null = supabaseUser ?? null;
  let metadataSource = existingMetadata ?? null;

  if (authUser && metadataSource === null) {
    metadataSource =
      (authUser.user_metadata as Record<string, unknown> | undefined) ??
      (authUser.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};
  }

  if (!authUser || metadataSource === null) {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("Unable to fetch user for subscription update", userError);
      return null;
    }
    authUser = userData.user;
    metadataSource =
      (authUser.user_metadata as Record<string, unknown> | undefined) ??
      (authUser.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};
  }

  const existingMeta = metadataSource ? { ...metadataSource } : {};
  const snapshot = extractSubscriptionSnapshot(subscription ?? null);

  const existingPlanSlug = normalizePlanSlug(
    (existingMeta.plan_slug as string | undefined) ??
      (existingMeta.subscription_tier as string | undefined) ??
      (existingMeta.subscription_level as string | undefined) ??
      "free",
  );
  const existingBillingCycle = normalizeBillingCycle(existingMeta.billing_cycle as string | undefined);
  const existingStatus = existingMeta.subscription_status as string | undefined;
  const existingPendingPlan = normalizePlanSlug(existingMeta.subscription_pending_plan_slug as string | undefined);
  const existingPendingBilling = normalizeBillingCycle(
    existingMeta.subscription_pending_billing_cycle as string | undefined,
  );
  const existingPendingEffective = existingMeta.subscription_pending_effective_date as string | undefined;
  const existingPendingScheduleId = existingMeta.subscription_pending_schedule_id as string | undefined;

  const planSlugNormalized =
    normalizePlanSlug(options.planSlug ?? snapshot?.planSlug ?? existingPlanSlug ?? "free") ?? "free";
  const subscriptionTier = PLAN_TIER_MAP[planSlugNormalized] ?? planSlugNormalized;

  const billingCycleNormalized =
    normalizeBillingCycle(options.billingCycle ?? snapshot?.billingCycle ?? existingBillingCycle ?? "monthly") ??
    "monthly";

  const subscriptionStatus =
    normalizeSubscriptionStatusValue(
      options.statusOverride ?? snapshot?.status ?? existingStatus ?? "trial",
      subscription ?? null,
    ) ?? "active";

  const currentPeriodEnd = snapshot?.currentPeriodEnd ?? toIsoString(existingMeta.current_period_end ?? null);
  const planStartedAt = snapshot?.planStartedAt ?? toIsoString(existingMeta.plan_started_at ?? null);
  const cancelAtPeriodEnd =
    snapshot?.cancelAtPeriodEnd ??
    (existingMeta.subscription_cancel_at_period_end as boolean | undefined) ??
    false;
  const stripeCustomerId =
    snapshot?.stripeCustomerId ?? (existingMeta.stripe_customer_id as string | undefined) ?? null;
  const stripeSubscriptionId =
    snapshot?.stripeSubscriptionId ?? (existingMeta.stripe_subscription_id as string | undefined) ?? null;

  const pendingPlanSlug =
    options.pendingPlanSlug !== undefined
      ? normalizePlanSlug(options.pendingPlanSlug)
      : snapshot?.pendingPlanSlug ?? existingPendingPlan ?? null;
  const pendingBillingCycle =
    options.pendingBillingCycle !== undefined
      ? normalizeBillingCycle(options.pendingBillingCycle)
      : snapshot?.pendingBillingCycle ?? existingPendingBilling ?? null;
  const pendingEffectiveDate =
    options.pendingEffectiveDate !== undefined
      ? toIsoString(options.pendingEffectiveDate)
      : snapshot?.pendingEffectiveDate ?? toIsoString(existingPendingEffective ?? null);
  const pendingScheduleId =
    options.pendingScheduleId !== undefined
      ? options.pendingScheduleId
      : snapshot?.pendingScheduleId ?? existingPendingScheduleId ?? null;

  const metadataPatch: Record<string, unknown> = {
    ...existingMeta,
    plan_slug: planSlugNormalized,
    subscription_level: subscriptionTier,
    subscription_tier: subscriptionTier,
    subscription_status: subscriptionStatus,
    billing_cycle: billingCycleNormalized,
    current_period_end: currentPeriodEnd ?? null,
    plan_started_at: planStartedAt ?? null,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_subscription_id: stripeSubscriptionId ?? null,
    subscription_cancel_at_period_end: cancelAtPeriodEnd,
    subscription_pending_plan_slug: pendingPlanSlug ?? null,
    subscription_pending_billing_cycle: pendingBillingCycle ?? null,
    subscription_pending_effective_date: pendingEffectiveDate ?? null,
    subscription_pending_schedule_id: pendingScheduleId ?? null,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: metadataPatch,
  });

  if (updateError) {
    console.error("Failed to persist subscription metadata", updateError, metadataPatch);
  }

  const lastLoginAt = toIsoString(
    (existingMeta.last_login as string | undefined) ?? authUser?.last_sign_in_at ?? null,
  );
  const marketingOptIn = (existingMeta.marketing_opt_in as boolean | undefined) ?? false;
  const weeklySummary = (existingMeta.weekly_summary as boolean | undefined) ?? false;
  const productUpdates = (existingMeta.product_updates as boolean | undefined) ?? false;
  const emailVerified =
    (existingMeta.email_verified as boolean | undefined) ?? Boolean(authUser?.email_confirmed_at);

  try {
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      email: authUser?.email ?? existingMeta.email ?? null,
      subscription_tier: subscriptionTier,
      subscription_status: subscriptionStatus,
      billing_cycle: billingCycleNormalized,
      current_period_end: currentPeriodEnd ?? null,
      plan_started_at: planStartedAt ?? null,
      last_login_at: lastLoginAt,
      email_verified: emailVerified,
      marketing_opt_in: marketingOptIn,
      weekly_summary: weeklySummary,
      product_updates: productUpdates,
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      subscription_cancel_at_period_end: cancelAtPeriodEnd,
      subscription_pending_plan_slug: pendingPlanSlug ?? null,
      subscription_pending_billing_cycle: pendingBillingCycle ?? null,
      subscription_pending_effective_date: pendingEffectiveDate ?? null,
      subscription_pending_schedule_id: pendingScheduleId ?? null,
      updated_at: new Date().toISOString(),
      created_at: authUser?.created_at ?? existingMeta.created_at ?? new Date().toISOString(),
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

  return metadataPatch;
};

export const persistStripeCustomerId = async (
  userId: string,
  stripeCustomerId: string,
  options: { supabaseUser?: SupabaseAuthUser | null; existingMetadata?: Record<string, unknown> | null } = {},
) => {
  if (!stripeCustomerId) return;
  const supabase = getServiceSupabaseClient();

  let authUser: SupabaseAuthUser | null = options.supabaseUser ?? null;
  let metadataSource = options.existingMetadata ?? null;

  if (authUser && metadataSource === null) {
    metadataSource =
      (authUser.user_metadata as Record<string, unknown> | undefined) ??
      (authUser.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};
  }

  if (!authUser || metadataSource === null) {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("Unable to fetch user while persisting stripe_customer_id", userError);
      return;
    }
    authUser = userData.user;
    metadataSource =
      (authUser.user_metadata as Record<string, unknown> | undefined) ??
      (authUser.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};
  }

  const existingMeta = metadataSource ? { ...metadataSource } : {};
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
      email: authUser?.email ?? existingMeta.email ?? null,
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

export const ensureStripeCustomerId = async (
  stripe: Stripe,
  user: SupabaseAuthUser,
  metadata?: Record<string, unknown> | null,
  options: { persist?: boolean } = {},
) => {
  if (!stripe) throw new Error("Stripe client unavailable");
  const { persist = false } = options;

  const supabaseMetadata =
    metadata ??
    (user.user_metadata as Record<string, unknown> | undefined) ??
    (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  const existingMetaId = metadataStringOrNull(supabaseMetadata.stripe_customer_id);
  if (existingMetaId) {
    if (persist) {
      await persistStripeCustomerId(user.id, existingMetaId, {
        supabaseUser: user,
        existingMetadata: supabaseMetadata,
      });
    }
    return existingMetaId;
  }

  const resolveByMetadata = async () => {
    try {
      if (stripe.customers.search) {
        const result = await stripe.customers.search({
          query: `metadata['supabase_user_id']:'${user.id}'`,
          limit: 1,
        });
        return result.data?.[0] ?? null;
      }
    } catch (searchError) {
      console.warn("Stripe customer search unavailable", searchError);
    }
    return null;
  };

  let existingCustomer: Stripe.Customer | null = await resolveByMetadata();

  if (!existingCustomer) {
    const emailCandidates = [
      user.email,
      metadataStringOrNull(supabaseMetadata.email),
      metadataStringOrNull(supabaseMetadata.contact_email),
    ];

    const normalizedEmail = emailCandidates.find((entry) => entry && entry.length) ?? null;

    if (normalizedEmail) {
      try {
        const matches = await stripe.customers.list({ email: normalizedEmail, limit: 20 });
        existingCustomer =
          matches.data.find((candidate) => metadataStringOrNull(candidate.email) === normalizedEmail) ?? null;
      } catch (listError) {
        console.warn("Unable to list existing Stripe customers", listError);
      }
    }
  }

  if (!existingCustomer) {
    try {
      existingCustomer = await stripe.customers.create({
        email:
          metadataStringOrNull(supabaseMetadata.contact_email) ??
          metadataStringOrNull(supabaseMetadata.email) ??
          user.email ??
          undefined,
        name:
          metadataStringOrNull(supabaseMetadata.full_name) ??
          metadataStringOrNull(supabaseMetadata.name) ??
          metadataStringOrNull(supabaseMetadata.display_name) ??
          undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });
    } catch (createError) {
      console.error("Failed to create Stripe customer", createError);
      throw createError;
    }
  } else if (!metadataStringOrNull(existingCustomer.metadata?.supabase_user_id)) {
    try {
      await stripe.customers.update(existingCustomer.id, {
        metadata: {
          ...(existingCustomer.metadata ?? {}),
          supabase_user_id: user.id,
        },
      });
    } catch (updateError) {
      console.warn("Failed to backfill supabase_user_id metadata on customer", updateError);
    }
  }

  if (!existingCustomer?.id) {
    throw new Error("Stripe customer provisioning failed");
  }

  if (persist) {
    await persistStripeCustomerId(user.id, existingCustomer.id, {
      supabaseUser: user,
      existingMetadata: supabaseMetadata,
    });
  }

  return existingCustomer.id;
};

export const syncUserMetadataFromStripe = async (
  stripe: Stripe,
  userId: string,
  customerId?: string | null,
) => {
  try {
    const supabase = getServiceSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("Unable to fetch user for metadata sync", userError);
      return null;
    }
    const authUser = userData.user;
    const existingMeta =
      (authUser.user_metadata as Record<string, unknown> | undefined) ??
      (authUser.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const stripeSubscriptionId = existingMeta.stripe_subscription_id as string | undefined;
    let subscription: Stripe.Subscription | null = null;

    try {
      if (stripeSubscriptionId) {
        subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
          expand: ["items.data.price.product", "latest_invoice", "schedule", "schedule.phases"],
        });
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
          supabaseUser: authUser,
          existingMetadata: existingMeta,
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
      supabaseUser: authUser,
      existingMetadata: existingMeta,
    });
    return subscription;
  } catch (error) {
    console.error("syncUserMetadataFromStripe failed", error);
    return null;
  }
};

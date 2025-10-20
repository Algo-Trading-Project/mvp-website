import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";
import {
  derivePlanInfoFromSubscription,
  normalizeBillingCycle,
  normalizePlanSlug,
  persistStripeCustomerId,
  updateUserFromSubscription,
  PLAN_TIER_MAP,
  getPlanInfoForPriceId,
} from "../_shared/subscription.ts";

type StripeEvent = Stripe.Event;
type StripeSubscription = Stripe.Subscription;
type StripeCustomer = Stripe.Customer;
type StripeInvoice = Stripe.Invoice;
type StripeCheckoutSession = Stripe.Checkout.Session;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.warn(
    "Stripe webhook secrets are not fully configured; webhook handling will fail until set.",
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

const subscriptionExpand = [
  "items.data.price",
  "items.data.price.product",
  "latest_invoice",
  "customer",
  "schedule",
  "schedule.phases",
  // Deep expansions so we can infer pending plan/cycle from scheduled phase price
  "schedule.phases.items.price",
];

const metadataStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const resolveUserIdFromCustomer = async (customer: StripeCustomer | string | null | undefined) => {
  if (!customer || !stripe) return null;
  if (typeof customer === "object" && customer.metadata) {
    const direct =
      metadataStringOrNull((customer.metadata as Record<string, unknown>)?.supabase_user_id) ??
      metadataStringOrNull((customer.metadata as Record<string, unknown>)?.user_id);
    if (direct) return direct;
  }
  const customerId = typeof customer === "string" ? customer : customer?.id ?? null;
  if (!customerId) return null;
  try {
    const fetched = await stripe.customers.retrieve(customerId);
    if (typeof fetched === "object" && fetched.metadata) {
      return (
        metadataStringOrNull((fetched.metadata as Record<string, unknown>)?.supabase_user_id) ??
        metadataStringOrNull((fetched.metadata as Record<string, unknown>)?.user_id)
      );
    }
  } catch (error) {
    console.warn("Failed to resolve user id from customer", customerId, error);
  }
  return null;
};

const resolveUserIdFromSubscription = async (subscription: StripeSubscription) => {
  const direct = metadataStringOrNull(subscription.metadata?.user_id);
  if (direct) return direct;
  return resolveUserIdFromCustomer(subscription.customer);
};

const fetchSubscription = async (subscriptionId: string | null | undefined) => {
  if (!stripe || !subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId, { expand: subscriptionExpand });
  } catch (error) {
    console.warn("Unable to retrieve subscription", subscriptionId, error);
    return null;
  }
};

const computePendingFromSchedule = async (subscription: StripeSubscription) => {
  if (!stripe) {
    return { planSlug: null as string | null, billingCycle: null as string | null, effectiveDate: null as string | null, scheduleId: null as string | null };
  }
  
  // Resolve schedule object
  // @ts-ignore schedule can be object|string|null
  let schedule: any =
    typeof subscription.schedule === "object" && subscription.schedule
      ? subscription.schedule
      : null;

  // If only an ID, fetch schedule with needed expansions
  // @ts-ignore schedule can be string
  const scheduleIdFromString: string | null = typeof subscription.schedule === "string" ? subscription.schedule : null;
  if (!schedule && scheduleIdFromString) {
    try {
      schedule = await stripe.subscriptionSchedules.retrieve(scheduleIdFromString, {
        expand: ["phases", "phases.items.price"],
      });
    } catch (e) {
      console.warn("Failed to retrieve subscription schedule", scheduleIdFromString, e);
    }
  }

  if (!schedule) {
    return { planSlug: null, billingCycle: null, effectiveDate: null, scheduleId: null };
  }

  const phases = schedule.phases ?? [];
  if (!phases.length) {
    return { planSlug: null, billingCycle: null, effectiveDate: null, scheduleId: schedule.id ?? null };
  }

  const currentPhaseEnd = schedule.current_phase?.end_date ?? Math.floor(Date.now() / 1000);
  const candidates = phases
    .filter((p) => (p.start_date ?? 0) >= currentPhaseEnd)
    .sort((a, b) => (a.start_date ?? 0) - (b.start_date ?? 0));
  const phase = candidates.length ? candidates[0] : phases[phases.length - 1];

  // Determine price object/id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceObjOrId: any = phase?.items?.[0]?.price ?? null;
  const priceId: string | null = typeof priceObjOrId === "string" ? priceObjOrId : priceObjOrId?.id ?? null;
  const mapping = getPlanInfoForPriceId(priceId);

  // Try several sources for plan/cycle
  const phasePlan =
    (phase?.metadata && typeof phase.metadata === "object"
      ? (phase.metadata as Record<string, unknown>).plan_slug ??
        (phase.metadata as Record<string, unknown>).pending_plan_slug
      : null) ?? null;
  const phaseCycle =
    (phase?.metadata && typeof phase.metadata === "object"
      ? (phase.metadata as Record<string, unknown>).billing_cycle ??
        (phase.metadata as Record<string, unknown>).pending_billing_cycle
      : null) ?? null;

  const priceMetaPlan =
    typeof priceObjOrId === "object" && priceObjOrId?.metadata
      ? (priceObjOrId.metadata as Record<string, unknown>).plan_slug ?? null
      : null;
  const priceMetaCycle =
    typeof priceObjOrId === "object" && priceObjOrId?.metadata
      ? (priceObjOrId.metadata as Record<string, unknown>).billing_cycle ?? null
      : null;

  const planSlug = normalizePlanSlug((mapping?.planSlug ?? (phasePlan as string | null) ?? (priceMetaPlan as string | null)) ?? null);
  const billingCycle =
    normalizeBillingCycle(
      (mapping?.billingCycle ?? (phaseCycle as string | null) ?? (priceMetaCycle as string | null) ??
        (typeof priceObjOrId === "object" ? (priceObjOrId.recurring?.interval as string | undefined) ?? null : null)) ??
        null,
    );

  const effectiveDate = phase?.start_date ? new Date(phase.start_date * 1000).toISOString() : null;
  return {
    planSlug: planSlug ?? null,
    billingCycle: billingCycle ?? null,
    effectiveDate,
    scheduleId: schedule.id ?? scheduleIdFromString ?? null,
  };
};

const handleSubscriptionUpdate = async (
  subscription: StripeSubscription,
  explicitUserId?: string | null,
) => {
  const userId = explicitUserId ?? (await resolveUserIdFromSubscription(subscription));
  if (!userId) {
    console.warn("Subscription event missing user_id metadata", subscription.id);
    return;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  if (customerId) {
    await persistStripeCustomerId(userId, customerId);
  }

  const derived = derivePlanInfoFromSubscription(subscription);
  // Also compute pending change from schedule (expanded or via fetch fallback)
  const pending = await computePendingFromSchedule(subscription);
  const currentEnd = typeof subscription.current_period_end === 'number' ? subscription.current_period_end : null;
  const isCanceled = (subscription.status ?? '').toLowerCase() === 'canceled';
  // Ensure cancel_at_period_end is forced to false once fully canceled so UI/state clear correctly
  const subForUpdate = isCanceled ? { ...subscription, cancel_at_period_end: false } : subscription;
  await updateUserFromSubscription({
    userId,
    subscription: subForUpdate,
    planSlug: derived.planSlug ?? undefined,
    billingCycle: derived.billingCycle ?? undefined,
    statusOverride: subscription.status ?? undefined,
    // IMPORTANT: pass through nulls explicitly to clear pending fields when schedule is canceled
    pendingPlanSlug: isCanceled ? null : pending.planSlug,
    pendingBillingCycle: isCanceled ? null : pending.billingCycle,
    pendingEffectiveDate: isCanceled ? null : pending.effectiveDate,
    pendingScheduleId: isCanceled ? null : pending.scheduleId,
    // When canceled, reset renewal to far-future so UI renders N/A
    currentPeriodEndOverride: isCanceled ? '9999-12-31T00:00:00Z' : (currentEnd ?? undefined),
  });
};

const handleCheckoutSessionCompleted = async (event: StripeEvent) => {
  const session = event.data.object as StripeCheckoutSession;
  if (!stripe) return;

  const userId =
    metadataStringOrNull(session.metadata?.user_id) ??
    metadataStringOrNull(session.client_reference_id);

  if (!userId) {
    console.warn("Checkout session completed without user_id metadata", session.id);
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (customerId) {
    await persistStripeCustomerId(userId, customerId);
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const subscription = await fetchSubscription(subscriptionId);

  if (subscription) {
    await handleSubscriptionUpdate(subscription, userId);
    return;
  }

  const planSlug = normalizePlanSlug(session.metadata?.plan_slug ?? null) ?? null;
  const billingCycle = normalizeBillingCycle(session.metadata?.billing_cycle ?? null) ?? null;

  await updateUserFromSubscription({
    userId,
    subscription: null,
    planSlug: planSlug ?? undefined,
    billingCycle: billingCycle ?? undefined,
    statusOverride: "incomplete",
  });
};

const handleInvoiceEvent = async (event: StripeEvent) => {
  if (!stripe) return;
  const invoice = event.data.object as StripeInvoice;
  const invAny: any = invoice as any;

  // Resolve subscription id from several locations (API versions differ)
  let subscriptionId: string | null = null;
  if (typeof invoice.subscription === "string") {
    subscriptionId = invoice.subscription;
  } else if (invoice.subscription && typeof (invoice.subscription as any).id === "string") {
    subscriptionId = (invoice.subscription as any).id;
  }
  if (!subscriptionId && invAny.parent && invAny.parent.subscription_details) {
    const sd = invAny.parent.subscription_details;
    if (sd && typeof sd.subscription === "string") {
      subscriptionId = sd.subscription as string;
    }
  }
  // Avoid deeper property chains beyond 4 levels; do not parse via invoice.lines.data[0].parent...

  // Try to fetch subscription if we found an id (to sync plan/pending fields)
  let subscription = await fetchSubscription(subscriptionId);

  // Resolve user id from invoice/lines/customer/subscription metadata
  let userId: string | null = metadataStringOrNull(invoice.metadata?.user_id);
  if (!userId && subscription) {
    userId = await resolveUserIdFromSubscription(subscription);
  }
  if (!userId) {
    const customerRef = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
    if (customerRef) {
      userId = await resolveUserIdFromCustomer(customerRef);
    }
  }
  if (!userId) {
    console.warn("Invoice event missing user id", invoice.id);
    return;
  }

  // Persist stripe_customer_id for convenience
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (customerId) {
    await persistStripeCustomerId(userId, customerId);
  }

  // Fallback: if subscription still unresolved, list by customer and pick latest non-canceled
  if (!subscription && customerId) {
    try {
      const listed = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      if (listed?.data?.length) {
        subscription = listed.data.find((s) => s.status !== "canceled") ?? listed.data.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
      }
    } catch (e) {
      console.warn("Unable to fallback-list subscriptions for customer", customerId, e);
    }
  }

  // Decide whether to flip status based on billing_reason
  const reason: string | null = (invAny.billing_reason as string | undefined) ?? null;
  let statusOverride: string | undefined = undefined;
  if (event.type === "invoice.payment_failed") {
    // Only mark payment_required for failures that affect entitlements
    const dunningReasons = new Set(["subscription_cycle", "subscription_create"]);
    if (reason && dunningReasons.has(reason)) {
      statusOverride = "payment_required";
    }
  } else if (event.type === "invoice.payment_succeeded") {
    statusOverride = "active";
  }

  // Keep other fields in sync when we have a subscription
  const derived = subscription ? derivePlanInfoFromSubscription(subscription) : null;
  const pending = subscription ? await computePendingFromSchedule(subscription) : null;

  // Renewal date override strategy:
  // - Prefer Stripe's subscription.current_period_end whenever available (all reasons)
  // - If unavailable and this is a real cycle start (create/cycle), compute from now + billing cycle
  let currentPeriodEndOverride: number | undefined = undefined;
  const stripeAnchor = typeof subscription?.current_period_end === "number" ? subscription.current_period_end : null;
  if (stripeAnchor) {
    currentPeriodEndOverride = stripeAnchor;
  } else if (event.type === "invoice.payment_succeeded" && (reason === "subscription_create" || reason === "subscription_cycle")) {
    const cycleFromSub = derived?.billingCycle ?? null;
    const cycleFromInvoiceMeta = metadataStringOrNull(invAny.parent?.subscription_details?.metadata?.billing_cycle) ?? null;
    const cycle = (cycleFromSub ?? cycleFromInvoiceMeta ?? "monthly").toLowerCase();
    const now = new Date();
    if (cycle === "annual") now.setFullYear(now.getFullYear() + 1);
    else now.setMonth(now.getMonth() + 1);
    currentPeriodEndOverride = Math.floor(now.getTime() / 1000);
  }

  await updateUserFromSubscription({
    userId,
    subscription: subscription ?? null,
    planSlug: derived?.planSlug ?? undefined,
    billingCycle: derived?.billingCycle ?? undefined,
    statusOverride,
    pendingPlanSlug: pending?.planSlug ?? undefined,
    pendingBillingCycle: pending?.billingCycle ?? undefined,
    pendingEffectiveDate: pending?.effectiveDate ?? undefined,
    pendingScheduleId: pending?.scheduleId ?? undefined,
    // If initial subscription payment failed, push far‑future default so UI shows N/A
    currentPeriodEndOverride: (event.type === "invoice.payment_failed" && reason === "subscription_create")
      ? "9999-12-31T00:00:00Z"
      : currentPeriodEndOverride,
  });
};

const relevantEvents = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const tierOrder: Record<string, number> = { free: 0, lite: 1, pro: 2, api: 3 };
const rankTier = (planSlug: string | null | undefined) => {
  const tier = planSlug ? PLAN_TIER_MAP[planSlug] ?? planSlug : "free";
  return tierOrder[tier] ?? 0;
};

const firstPriceId = (sub: StripeSubscription | null | undefined) =>
  sub?.items?.data?.[0]?.price?.id ?? null;

/**
 * Enforce plan/interval change policy programmatically:
 * - Tier upgrade: apply immediately (proration) at current interval; if interval also changed, schedule that interval change at period end.
 * - Tier downgrade: schedule at period end.
 * - Same-tier interval change: schedule at period end.
 */
const enforceChangePolicy = async (event: StripeEvent, subscription: StripeSubscription) => {
  if (!stripe) return;

  const newPriceId = firstPriceId(subscription);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevAttrs: any = (event as any).data?.previous_attributes ?? {};
  const prevPriceId: string | null =
    prevAttrs?.items?.data?.[0]?.price?.id ??
    (typeof prevAttrs?.items?.data?.[0]?.price === 'string' ? (prevAttrs.items.data[0].price as string) : null);

  if (!newPriceId || !prevPriceId || newPriceId === prevPriceId) return;

  const newMap = getPlanInfoForPriceId(newPriceId);
  const prevMap = getPlanInfoForPriceId(prevPriceId);
  if (!newMap || !prevMap) return;

  const newRank = rankTier(newMap.planSlug);
  const prevRank = rankTier(prevMap.planSlug);
  const sameTier = newMap.planSlug === prevMap.planSlug;
  const intervalChanged = newMap.billingCycle !== prevMap.billingCycle;
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) return;

  const cancelPortalArtifacts = async () => {
    try { await stripe.subscriptions.cancelPendingUpdate(subscription.id); } catch (_) {}
    // @ts-ignore schedule can be string|object|null
    const scheduleId: string | null = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id ?? null;
    if (scheduleId) { try { await stripe.subscriptionSchedules.cancel(scheduleId); } catch (_) {} }
  };

  if (newRank > prevRank) {
    // Upgrade immediately. If interval also changed, apply the requested price NOW and reset anchor to now.
    await cancelPortalArtifacts();
    try {
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: 'create_prorations',
        billing_cycle_anchor: intervalChanged ? 'now' : 'unchanged',
      });
    } catch (e) { console.warn('Immediate upgrade failed', e); }
    return;
  }

  // Downgrade or same-tier interval change: schedule at period end
  if (newRank < prevRank || (sameTier && intervalChanged)) {
    await cancelPortalArtifacts();
    try {
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: itemId, price: prevPriceId }],
        proration_behavior: 'none',
      });
    } catch (e) { console.warn('Revert to previous price failed', e); }
    const startAt = subscription.current_period_end ?? Math.floor(Date.now() / 1000) + 60;
    try {
      await stripe.subscriptionSchedules.create({
        from_subscription: subscription.id,
        phases: [{
          start_date: startAt,
          items: [{ price: newPriceId }],
          metadata: { pending_plan_slug: newMap.planSlug, pending_billing_cycle: newMap.billingCycle },
        }],
      });
    } catch (e) { console.warn('Failed to schedule deferred change', e); }
  }
};
// (removed no-op duplicate enforceChangePolicy)

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const parseStripeSignature = (header: string) => {
  const result: Record<string, string> = {};
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }
  return {
    timestamp: result["t"] ?? "",
    signature: result["v1"] ?? "",
  };
};

const verifyStripeSignature = async (payload: string, header: string, secret: string) => {
  const { timestamp, signature } = parseStripeSignature(header);
  if (!timestamp || !signature) {
    throw new Error("Invalid signature header format");
  }

  const toleranceSeconds = 300;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) ||
      Math.abs(timestampNumber - Date.now() / 1000) > toleranceSeconds) {
    throw new Error("Signature timestamp outside tolerance");
  }

  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const computedBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const computed = Array.from(new Uint8Array(computedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!timingSafeEqual(computed, signature)) {
    throw new Error("Signature mismatch");
  }

  return JSON.parse(payload) as StripeEvent;
};

const handleEvent = async (event: StripeEvent) => {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end": {
      // Always refetch with expansions so we can infer pending schedule info
      const subObj = event.data.object as StripeSubscription;
      const subId = subObj?.id ?? null;
      let subscription = await fetchSubscription(subId);
      if (subscription) {
        await enforceChangePolicy(event, subscription);
        // Re-fetch to pick up any enforced changes
        subscription = (await fetchSubscription(subscription.id)) ?? subscription;
        await handleSubscriptionUpdate(subscription);
      } else {
        // Fallback to raw object if refetch fails
        await enforceChangePolicy(event, subObj);
        await handleSubscriptionUpdate(subObj);
      }
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      await handleInvoiceEvent(event);
      break;
    default:
      if (!relevantEvents.has(event.type)) {
        console.warn("Received unhandled Stripe event", event.type);
      }
      break;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return internalError("Stripe webhook configuration missing");
  }

  const signatureHeader = req.headers.get("stripe-signature");
  if (!signatureHeader) {
    return badRequest("Missing stripe-signature header");
  }

  const rawBody = await req.text();

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return badRequest("Invalid signature");
  }

  const supabase = getServiceSupabaseClient();

  const eventId = event.id;

  // Ensure an event row exists (best-effort). If it already exists, ignore duplicate error.
  try {
    await supabase.from("stripe_webhook_events").insert({ event_id: eventId });
  } catch (_) {}

  // Try to claim this event for processing. Only proceed if we acquire the claim.
  const nowIso = new Date().toISOString();
  // Reclaim stale claims after 1 minute (processing normally takes < 20s)
  const staleCutoffMs = Date.now() - 1 * 60 * 1000;

  // First, try to claim if never started
  let { data: claimed, error: claimError } = await supabase
    .from("stripe_webhook_events")
    .update({ processing_started_at: nowIso })
    .eq("event_id", eventId)
    .is("processed_at", null)
    .is("processing_started_at", null)
    .select("event_id")
    .maybeSingle();

  if (claimError) {
    console.warn("Idempotency claim (never-started) failed", { eventId, claimError });
    claimed = null;
  }

  if (!claimed?.event_id) {
    // Not claimed yet; check current state
    const { data: existing, error: readErr } = await supabase
      .from("stripe_webhook_events")
      .select("processed_at, processing_started_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (readErr) {
      console.warn("Idempotency state read failed", { eventId, readErr });
      // Ask Stripe to retry later
      return json({ received: false, retry: true, is_duplicate_event: false }, { status: 409 });
    }

    const processed = Boolean(existing?.processed_at);
    if (processed) return json({ received: true, is_duplicate_event: true });

    const startedAt = existing?.processing_started_at
      ? new Date(existing.processing_started_at as string).getTime()
      : null;
    const stale = startedAt ? startedAt < staleCutoffMs : false;

    if (!stale && startedAt) {
      // In progress and not stale — let Stripe retry later
      return json({ received: false, retry: true, is_duplicate_event: false, in_progress: true }, { status: 409 });
    }

    // Attempt to reclaim stale claim
    const { data: reclaimed, error: reclaimErr } = await supabase
      .from("stripe_webhook_events")
      .update({ processing_started_at: nowIso })
      .eq("event_id", eventId)
      .is("processed_at", null)
      .lt("processing_started_at", new Date(staleCutoffMs).toISOString())
      .select("event_id")
      .maybeSingle();

    if (reclaimErr) {
      console.warn("Idempotency stale-claim failed", { eventId, reclaimErr });
      return json({ received: false, retry: true, is_duplicate_event: false }, { status: 409 });
    }

    if (!reclaimed?.event_id) {
      // Could not reclaim — another process likely claimed in parallel
      return json({ received: false, retry: true, is_duplicate_event: false }, { status: 409 });
    }

    // Proceed with reclaimed claim
  }

  try {
    await handleEvent(event);
    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return json({ received: true, is_duplicate_event: false });
  } catch (error) {
    // Release the claim so Stripe retries can be processed later
    try {
      await supabase
        .from("stripe_webhook_events")
        .update({ processing_started_at: null })
        .eq("event_id", eventId)
        .is("processed_at", null);
    } catch (_) {}
    return internalError(error);
  }
});

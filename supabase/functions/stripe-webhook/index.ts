import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
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
  let schedule: Stripe.SubscriptionSchedule | null =
    typeof subscription.schedule === "object" && subscription.schedule
      ? (subscription.schedule as Stripe.SubscriptionSchedule)
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
  await updateUserFromSubscription({
    userId,
    subscription,
    planSlug: derived.planSlug ?? undefined,
    billingCycle: derived.billingCycle ?? undefined,
    statusOverride: subscription.status ?? undefined,
    pendingPlanSlug: pending.planSlug ?? undefined,
    pendingBillingCycle: pending.billingCycle ?? undefined,
    pendingEffectiveDate: pending.effectiveDate ?? undefined,
    pendingScheduleId: pending.scheduleId ?? undefined,
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

  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  const subscription = await fetchSubscription(subscriptionId);
  if (!subscription) {
    console.warn("Invoice event without retrievable subscription", invoice.id);
    return;
  }

  const userId =
    metadataStringOrNull(invoice.metadata?.user_id) ??
    (await resolveUserIdFromSubscription(subscription));

  if (!userId) {
    console.warn("Invoice event missing user id", invoice.id);
    return;
  }

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (customerId) {
    await persistStripeCustomerId(userId, customerId);
  }

  await handleSubscriptionUpdate(subscription, userId);
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
 * Enforce change policy:
 * - Downgrade (lower tier): schedule change at period end; keep current price for current period
 * - Upgrade (higher tier): apply immediately (no schedule)
 * - Same tier, cycle change: schedule change at period end
 */
const enforceChangePolicy = async (
  event: StripeEvent,
  subscription: StripeSubscription,
) => {
  if (!stripe) return;

  const newPrice = firstPriceId(subscription);
  // Try to read previous price from previous_attributes; fall back to metadata if missing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevAttrs: any = (event as any).data?.previous_attributes ?? {};
  const prevPrice: string | null =
    prevAttrs?.items?.data?.[0]?.price?.id ??
    (typeof prevAttrs?.items?.data?.[0]?.price === "string"
      ? (prevAttrs?.items?.data?.[0]?.price as string)
      : null);

  if (!newPrice || !prevPrice || newPrice === prevPrice) {
    return; // nothing to enforce
  }

  const newMap = getPlanInfoForPriceId(newPrice);
  const prevMap = getPlanInfoForPriceId(prevPrice);
  if (!newMap || !prevMap) return;

  const newRank = rankTier(newMap.planSlug);
  const prevRank = rankTier(prevMap.planSlug);
  const sameTier = newMap.planSlug === prevMap.planSlug;
  const cycleChanged = newMap.billingCycle !== prevMap.billingCycle;

  // Helper: revert current period to previous price (no proration)
  const revertToPreviousForCurrentPeriod = async () => {
    try {
      const itemId = subscription.items?.data?.[0]?.id;
      if (!itemId) return;
      await stripe.subscriptions.update(subscription.id, {
        items: [
          {
            id: itemId,
            price: prevPrice,
          },
        ],
        proration_behavior: "none",
      });
    } catch (err) {
      console.warn("Failed to revert subscription to previous price", subscription.id, err);
    }
  };

  // Helper: ensure a schedule applies new price at period end
  const ensureScheduleForNextPeriod = async () => {
    const startAt = subscription.current_period_end ?? Math.floor(Date.now() / 1000) + 60;
    try {
      // Update existing schedule if present; otherwise create one from subscription
      // @ts-ignore schedule can be object|string
      const scheduleId: string | null =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule?.id ?? null;

      if (scheduleId) {
        try {
          await stripe.subscriptionSchedules.update(scheduleId, {
            phases: [
              {
                start_date: startAt,
                items: [{ price: newPrice }],
                metadata: {
                  pending_plan_slug: newMap.planSlug,
                  pending_billing_cycle: newMap.billingCycle,
                },
              },
            ],
          });
          return;
        } catch (e) {
          console.warn("Failed to update existing schedule; will recreate", scheduleId, e);
        }
      }

      await stripe.subscriptionSchedules.create({
        from_subscription: subscription.id,
        phases: [
          {
            start_date: startAt,
            items: [{ price: newPrice }],
            metadata: {
              pending_plan_slug: newMap.planSlug,
              pending_billing_cycle: newMap.billingCycle,
            },
          },
        ],
      });
    } catch (err) {
      console.error("Failed to create/update subscription schedule", subscription.id, err);
    }
  };

  if (newRank > prevRank) {
    // Upgrade: keep immediate change (already applied by Stripe); clear any pending schedule
    try {
      // @ts-ignore
      const scheduleId: string | null =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule?.id ?? null;
      if (scheduleId) {
        await stripe.subscriptionSchedules.cancel(scheduleId);
      }
    } catch (err) {
      console.warn("Failed to cancel existing schedule after upgrade", err);
    }
    return;
  }

  // Downgrade or same-tier cycle change: schedule at period end and revert current period
  if (newRank < prevRank || (sameTier && cycleChanged)) {
    await revertToPreviousForCurrentPeriod();
    await ensureScheduleForNextPeriod();
  }
};

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
      const subscription = await fetchSubscription(subId);
      if (subscription) {
        await handleSubscriptionUpdate(subscription);
      } else {
        // Fallback to raw object if refetch fails
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

  try {
    await handleEvent(event);
    return json({ received: true });
  } catch (error) {
    return internalError(error);
  }
});

// No Stripe SDK/runtime import: use Stripe REST via fetch to avoid Node polyfills
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

type StripeEvent = any;
type StripeSubscription = any;
type StripeCustomer = any;
type StripeInvoice = any;
type StripeCheckoutSession = any;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.warn(
    "Stripe webhook secrets are not fully configured; webhook handling will fail until set.",
  );
}

// Minimal Stripe REST helper (no Node polyfills)
const stripeFetch = async (
  method: string,
  path: string,
  body?: Record<string, string | number | boolean | null | undefined>,
) => {
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe secret key missing");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
  };
  let requestBody: BodyInit | undefined;
  if (method !== "GET" && body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      params.append(k, String(v));
    }
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    requestBody = params;
  }
  const url = `https://api.stripe.com/v1${path}`;
  const res = await fetch(url, { method, headers, body: requestBody });
  const json = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(json?.error?.message || `Stripe error ${res.status}`), {
      status: res.status,
      raw: json,
    });
  }
  return json;
};

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
  if (!customer) return null;
  if (typeof customer === "object" && customer.metadata) {
    const direct =
      metadataStringOrNull((customer.metadata as Record<string, unknown>)?.supabase_user_id) ??
      metadataStringOrNull((customer.metadata as Record<string, unknown>)?.user_id);
    if (direct) return direct;
  }
  const customerId = typeof customer === "string" ? customer : customer?.id ?? null;
  if (!customerId) return null;
  try {
    const fetched = await stripeFetch("GET", `/customers/${customerId}`);
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
  if (!subscriptionId) return null;
  try {
    const params = new URLSearchParams();
    for (const key of subscriptionExpand) params.append("expand[]", key);
    return await stripeFetch("GET", `/subscriptions/${subscriptionId}?${params.toString()}`);
  } catch (error) {
    console.warn("Unable to retrieve subscription", subscriptionId, error);
    return null;
  }
};

const computePendingFromSchedule = async (subscription: StripeSubscription) => {
  // stripeFetch available globally
  
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
      const params = new URLSearchParams();
      params.append("expand[]", "phases");
      params.append("expand[]", "phases.items.price");
      schedule = await stripeFetch("GET", `/subscription_schedules/${scheduleIdFromString}?${params.toString()}`);
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
    // IMPORTANT: pass through nulls explicitly to clear pending fields when schedule is canceled
    pendingPlanSlug: pending.planSlug,
    pendingBillingCycle: pending.billingCycle,
    pendingEffectiveDate: pending.effectiveDate,
    pendingScheduleId: pending.scheduleId,
  });
};

const handleCheckoutSessionCompleted = async (event: StripeEvent) => {
  const session = event.data.object as StripeCheckoutSession;

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
      const params = new URLSearchParams({ customer: customerId, status: "all", limit: "20" });
      const listed = await stripeFetch("GET", `/subscriptions?${params.toString()}`);
      const data = listed?.data || [];
      if (data.length) {
        subscription = data.find((s: any) => s.status !== "canceled") ?? data.sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))[0];
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

  // Compute period end from invoice as fallback for initial payment
  const computedPeriodEnd: number | null =
    (typeof invAny.period_end === 'number' ? invAny.period_end : null) ??
    (invAny.lines && Array.isArray(invAny.lines.data) && invAny.lines.data[0]?.period?.end
      ? Number(invAny.lines.data[0].period.end)
      : null);

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
    currentPeriodEndOverride: computedPeriodEnd ?? undefined,
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
 * Enforce change policy:
 * - Downgrade (lower tier): schedule change at period end; keep current price for current period
 * - Upgrade (higher tier): apply immediately (no schedule)
 * - Same tier, cycle change: schedule change at period end
 */
const enforceChangePolicy = async (_event: StripeEvent, _subscription: StripeSubscription) => {
  // No-op: policy is enforced in the app/portal configuration.
  return;
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

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
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

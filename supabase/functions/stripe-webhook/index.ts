import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { corsHeaders } from "../_shared/middleware.ts";
import { badRequest, internalError, json, methodNotAllowed } from "../_shared/http.ts";
import {
  derivePlanInfoFromSubscription,
  normalizeBillingCycle,
  normalizePlanSlug,
  persistStripeCustomerId,
  updateUserFromSubscription,
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
  await updateUserFromSubscription({
    userId,
    subscription,
    planSlug: derived.planSlug ?? undefined,
    billingCycle: derived.billingCycle ?? undefined,
    statusOverride: subscription.status ?? undefined,
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
      const subscription = event.data.object as StripeSubscription;
      await handleSubscriptionUpdate(subscription);
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

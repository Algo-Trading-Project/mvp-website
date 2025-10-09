import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { json, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.warn("Stripe webhook secrets are not fully configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

const PLAN_TIER_MAP: Record<string, string> = {
  signals_pro: "pro",
  signals_api: "api",
  signals_lite: "lite",
};

const defaultOrigin = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";

async function updateUserFromSubscription(options: {
  userId: string;
  planSlug?: string | null;
  billingCycle?: string | null;
  subscription?: Stripe.Subscription | null;
  statusOverride?: string | null;
}) {
  const supabase = getServiceSupabaseClient();
  const { userId, planSlug, billingCycle, subscription, statusOverride } = options;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    console.error("Unable to fetch user for subscription update", userError);
    return;
  }

  const existingMeta =
    (userData.user.user_metadata as Record<string, unknown> | undefined) ??
    (userData.user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  const subscriptionStatus = statusOverride ?? subscription?.status ?? "active";

  const updates: Record<string, unknown> = {
    subscription_status: subscriptionStatus,
  };

  if (planSlug) {
    updates.subscription_tier = PLAN_TIER_MAP[planSlug] ?? planSlug;
  }

  if (billingCycle) {
    updates.billing_cycle = billingCycle;
  }

  if (subscription) {
    updates.plan_started_at = new Date(subscription.current_period_start * 1000).toISOString();
    updates.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
    updates.stripe_subscription_id = subscription.id;
    updates.stripe_customer_id = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
  }

  const newMetadata = { ...existingMeta, ...updates };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: newMetadata,
  });

  if (updateError) {
    console.error("Failed to persist subscription metadata", updateError, updates);
  }
}

async function handleCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const planSlug = session.metadata?.plan_slug;
  const billingCycle = session.metadata?.billing_cycle;

  if (!userId) {
    console.warn("Checkout session missing user metadata", session.id);
    return;
  }

  if (!stripe) {
    console.error("Stripe client unavailable during checkout session handling");
    return;
  }

  let subscription: Stripe.Subscription | null = null;
  if (session.subscription) {
    try {
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error("Failed to retrieve subscription", error);
    }
  }

  await updateUserFromSubscription({
    userId,
    planSlug: planSlug ?? undefined,
    billingCycle: billingCycle ?? undefined,
    subscription,
    statusOverride: subscription?.status ?? "active",
  });
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const planSlug = subscription.metadata?.plan_slug ??
    (subscription.items?.data?.[0]?.price?.metadata?.plan_slug as string | undefined);
  const billingCycle = subscription.metadata?.billing_cycle ??
    subscription.items?.data?.[0]?.price?.recurring?.interval ?? undefined;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.warn("Subscription create missing user_id metadata", subscription.id);
    return;
  }

  await updateUserFromSubscription({
    userId,
    planSlug,
    billingCycle,
    subscription,
    statusOverride: subscription.status,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const planSlug = subscription.metadata?.plan_slug ??
    (subscription.items?.data?.[0]?.price?.metadata?.plan_slug as string | undefined);
  const billingCycle = subscription.metadata?.billing_cycle ??
    subscription.items?.data?.[0]?.price?.recurring?.interval ?? undefined;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.warn("Subscription update missing user_id metadata", subscription.id);
    return;
  }

  await updateUserFromSubscription({
    userId,
    planSlug,
    billingCycle,
    subscription,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn("Subscription delete missing user metadata", subscription.id);
    return;
  }

  await updateUserFromSubscription({
    userId,
    planSlug: "free",
    billingCycle: null,
    subscription: null,
    statusOverride: "canceled",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return json({ error: "Stripe not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await req.text();

  try {
    const event = await stripe.webhooks.constructEventAsync(payload, signature, STRIPE_WEBHOOK_SECRET);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }
    return json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return internalError(error);
  }
  } catch (error) {
    console.error("Webhook signature verification failed", error);
    return json({ error: "Invalid signature" }, { status: 400 });
  }
});

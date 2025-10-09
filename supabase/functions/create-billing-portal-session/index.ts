import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { json, methodNotAllowed, internalError } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import {
  derivePlanInfoFromSubscription,
  persistStripeCustomerId,
  updateUserFromSubscription,
  getTrackedPriceIds,
} from "../_shared/subscription.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const defaultOrigin = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";
const STRIPE_PORTAL_CONFIGURATION_ID = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID") ?? "";

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-billing-portal-session will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
  : null;

let cachedPortalConfigurationId: string | null = STRIPE_PORTAL_CONFIGURATION_ID || null;
let cachedPortalProductIds: string[] | null = null;

const statusPriority: Record<string, number> = {
  active: 6,
  trialing: 5,
  past_due: 4,
  incomplete: 3,
  incomplete_expired: 2,
  canceled: 1,
};

const normalizeArray = (values: (string | null | undefined)[]) =>
  values
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .sort();

const buildPortalFeatures = (productIds: string[]) => {
  const sortedProducts = normalizeArray(productIds);
  const subscriptionUpdate =
    sortedProducts.length > 0
      ? {
          enabled: true,
          default_allowed_updates: ["price", "quantity"],
          products: sortedProducts,
          proration_behavior: "create_prorations",
        }
      : {
          enabled: false,
        };

  return {
    customer_update: {
      enabled: true,
      allowed_updates: ["email", "address"],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      cancellation_reason: { enabled: false },
    },
    subscription_pause: { enabled: false },
    subscription_update: subscriptionUpdate,
  };
};

const normalizePortalFeatures = (features: Stripe.BillingPortal.Configuration.Features | undefined | null) => {
  const subscriptionUpdate = features?.subscription_update;
  const customerUpdate = features?.customer_update;
  const subscriptionCancel = features?.subscription_cancel;
  return {
    customer_update: {
      enabled: Boolean(customerUpdate?.enabled),
      allowed_updates: normalizeArray(customerUpdate?.allowed_updates ?? []),
    },
    invoice_history: { enabled: Boolean(features?.invoice_history?.enabled) },
    payment_method_update: { enabled: Boolean(features?.payment_method_update?.enabled) },
    subscription_cancel: {
      enabled: Boolean(subscriptionCancel?.enabled),
      mode: subscriptionCancel?.mode ?? null,
    },
    subscription_update: {
      enabled: Boolean(subscriptionUpdate?.enabled),
      default_allowed_updates: normalizeArray(subscriptionUpdate?.default_allowed_updates ?? []),
      products: normalizeArray(subscriptionUpdate?.products ?? []),
      proration_behavior: subscriptionUpdate?.proration_behavior ?? null,
    },
  };
};

const featuresDiffer = (
  existing: Stripe.BillingPortal.Configuration.Features | undefined | null,
  desired: ReturnType<typeof buildPortalFeatures>,
) => {
  const normalizedExisting = normalizePortalFeatures(existing);
  const normalizedDesired = normalizePortalFeatures(desired as unknown as Stripe.BillingPortal.Configuration.Features);

  const compareArrays = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  if (normalizedExisting.customer_update.enabled !== normalizedDesired.customer_update.enabled) return true;
  if (!compareArrays(normalizedExisting.customer_update.allowed_updates, normalizedDesired.customer_update.allowed_updates)) {
    return true;
  }
  if (normalizedExisting.invoice_history.enabled !== normalizedDesired.invoice_history.enabled) return true;
  if (normalizedExisting.payment_method_update.enabled !== normalizedDesired.payment_method_update.enabled) return true;
  if (normalizedExisting.subscription_cancel.enabled !== normalizedDesired.subscription_cancel.enabled) return true;
  if (normalizedExisting.subscription_cancel.mode !== normalizedDesired.subscription_cancel.mode) return true;
  if (normalizedExisting.subscription_update.enabled !== normalizedDesired.subscription_update.enabled) return true;
  if (
    normalizedExisting.subscription_update.enabled &&
    normalizedDesired.subscription_update.enabled
  ) {
    if (
      normalizedExisting.subscription_update.proration_behavior !==
      normalizedDesired.subscription_update.proration_behavior
    ) {
      return true;
    }
    if (
      !compareArrays(
        normalizedExisting.subscription_update.default_allowed_updates,
        normalizedDesired.subscription_update.default_allowed_updates,
      )
    ) {
      return true;
    }
    if (!compareArrays(normalizedExisting.subscription_update.products, normalizedDesired.subscription_update.products)) {
      return true;
    }
  }
  return false;
};

const selectBestSubscription = (subscriptions: Stripe.ApiList<Stripe.Subscription>) => {
  if (!subscriptions.data?.length) {
    return null;
  }
  const sorted = [...subscriptions.data].sort((a, b) => {
    const priorityDiff = (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (b.created ?? 0) - (a.created ?? 0);
  });
  return sorted[0] ?? null;
};

const toLowerSafe = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : null;

const ensureStripeCustomer = async (
  user: Record<string, unknown>,
  metadata: Record<string, unknown>,
): Promise<string> => {
  if (!stripe) throw new Error("Stripe client unavailable");
  const existingMetaId = (metadata.stripe_customer_id as string | undefined) ?? null;
  if (existingMetaId) {
    return existingMetaId;
  }

  const emailCandidates = [
    user.email as string | undefined,
    metadata.email as string | undefined,
    metadata.contact_email as string | undefined,
  ];
  const normalizedEmail = toLowerSafe(emailCandidates.find((entry) => entry && entry.trim().length));

  let existingCustomer: Stripe.Customer | null = null;
  if (normalizedEmail) {
    try {
      const matches = await stripe.customers.list({ email: normalizedEmail, limit: 20 });
      existingCustomer =
        matches.data.find((candidate) => toLowerSafe(candidate.email) === normalizedEmail) ?? null;
    } catch (listError) {
      console.warn("Unable to list existing Stripe customers", listError);
    }
  }

  if (!existingCustomer) {
    try {
      existingCustomer = await stripe.customers.create({
        email: normalizedEmail ?? undefined,
        name:
          (metadata.full_name as string | undefined) ??
          (metadata.name as string | undefined) ??
          (metadata.display_name as string | undefined) ??
          undefined,
        metadata: {
          supabase_user_id: user.id as string,
        },
      });
    } catch (createError) {
      console.error("Failed to create Stripe customer", createError);
      throw createError;
    }
  }

  if (!existingCustomer?.id) {
    throw new Error("Stripe customer provisioning failed");
  }

  await persistStripeCustomerId(user.id as string, existingCustomer.id);
  return existingCustomer.id;
};

const fetchLatestSubscription = async (stripeCustomerId: string) => {
  if (!stripe) return null;
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      expand: ["data.items.data.price.product"],
      limit: 20,
    });
    return selectBestSubscription(subscriptions);
  } catch (error) {
    console.warn("Unable to load subscriptions for customer", stripeCustomerId, error);
    return null;
  }
};

const resolvePortalProducts = async (): Promise<string[]> => {
  if (!stripe) return [];
  if (cachedPortalProductIds) return cachedPortalProductIds;

  const uniqueProductIds = new Set<string>();
  const trackedPriceIds = getTrackedPriceIds();
  for (const priceId of trackedPriceIds) {
    if (!priceId) continue;
    try {
      const price = await stripe.prices.retrieve(priceId);
      const productId =
        typeof price.product === "string" ? price.product : price.product?.id ?? null;
      if (productId) {
        uniqueProductIds.add(productId);
      }
    } catch (error) {
      console.warn("Unable to resolve product for price", priceId, error);
    }
  }

  cachedPortalProductIds = Array.from(uniqueProductIds);
  return cachedPortalProductIds;
};

const ensurePortalConfiguration = async (): Promise<string | null> => {
  if (!stripe) return null;
  if (cachedPortalConfigurationId) {
    return cachedPortalConfigurationId;
  }

  const productIds = await resolvePortalProducts();
  const desiredFeatures = buildPortalFeatures(productIds);

  try {
    const configurations = await stripe.billingPortal.configurations.list();
    const selected =
      configurations.data?.find((config) => config.is_default) ??
      configurations.data?.find((config) => config.active) ??
      configurations.data?.[0] ??
      null;
    if (selected?.id) {
      if (featuresDiffer(selected.features, desiredFeatures)) {
        try {
          const updated = await stripe.billingPortal.configurations.update(selected.id, {
            features: desiredFeatures,
          });
          cachedPortalConfigurationId = updated.id;
          return cachedPortalConfigurationId;
        } catch (updateError) {
          console.error("Failed to update billing portal configuration", updateError);
          // Proceed with existing configuration if update fails
        }
      }
      cachedPortalConfigurationId = selected.id;
      return cachedPortalConfigurationId;
    }
  } catch (listError) {
    console.warn("Unable to list billing portal configurations", listError);
  }

  try {
    const created = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "QuantPulse Billing",
        privacy_policy_url: `${defaultOrigin}/privacy`,
        terms_of_service_url: `${defaultOrigin}/terms`,
      },
      features: desiredFeatures,
    });
    cachedPortalConfigurationId = created?.id ?? null;
    return cachedPortalConfigurationId;
  } catch (createError) {
    console.error("Failed to create billing portal configuration", createError);
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
    // optional payload
  }

  const returnUrl = String(payload.return_url ?? "");

  const metadata =
    (user.user_metadata as Record<string, unknown> | undefined) ??
    (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
    {};

  try {
    const stripeCustomerId = await ensureStripeCustomer(user as Record<string, unknown>, metadata);
    const portalConfigurationId = await ensurePortalConfiguration();
    if (!portalConfigurationId) {
      throw new Error(
        "Stripe billing portal configuration unavailable. Save portal settings in the Dashboard or set STRIPE_BILLING_PORTAL_CONFIGURATION_ID."
      );
    }

    const subscription = await fetchLatestSubscription(stripeCustomerId);
    if (subscription) {
      const inferred = derivePlanInfoFromSubscription(subscription);
      await updateUserFromSubscription({
        userId: user.id,
        subscription,
        planSlug: inferred.planSlug ?? undefined,
        billingCycle: inferred.billingCycle ?? undefined,
        statusOverride: subscription.status ?? undefined,
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      configuration: portalConfigurationId,
      return_url: returnUrl || `${defaultOrigin}/account`,
    });

    if (!session.url) {
      throw new Error("Billing portal session did not return a URL");
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Billing portal session failed", error);
    return internalError(error);
  }
});

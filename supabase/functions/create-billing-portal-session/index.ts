import Stripe from "https://esm.sh/stripe@12.17.0?target=deno";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { internalError, json, methodNotAllowed } from "../_shared/http.ts";
import { ensureStripeCustomerId, getTrackedPriceIds } from "../_shared/subscription.ts";
import type StripeTypes from "https://esm.sh/stripe@12.17.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const DEFAULT_SITE_URL = Deno.env.get("SITE_URL") ?? "https://quantpulse.ai";
const STRIPE_PORTAL_CONFIGURATION_ID = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID") ?? null;

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set; create-billing-portal-session will fail until configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

const normalizeUrl = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.length) return fallback;
  try {
    return new URL(trimmed).toString();
  } catch {
    return fallback;
  }
};

const resolveOriginFromRequest = (req: Request) => {
  const originHeader = req.headers.get("origin");
  if (originHeader) return originHeader;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = req.headers.get("host");
  if (host) {
    const protocol = forwardedProto ?? (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }
  return DEFAULT_SITE_URL;
};

const resolvePortalConfiguration = async (stripeClient: StripeTypes) => {
  if (STRIPE_PORTAL_CONFIGURATION_ID) {
    return STRIPE_PORTAL_CONFIGURATION_ID;
  }

  try {
    const configurations = await stripeClient.billingPortal.configurations.list({ limit: 20 });
    const selected =
      configurations.data.find((config) => config.is_default) ??
      configurations.data.find((config) => config.active) ??
      configurations.data[0];
    if (selected?.id) {
      return selected.id;
    }
  } catch (error) {
    console.warn("Unable to list billing portal configurations", error);
  }

  const productIds = await (async () => {
    const trackedPriceIds = getTrackedPriceIds();
    const uniqueProducts = new Set<string>();
    await Promise.allSettled(
      trackedPriceIds.map(async (priceId) => {
        try {
          const price = await stripeClient.prices.retrieve(priceId);
          const productId =
            typeof price.product === "string" ? price.product : price.product?.id ?? null;
          if (productId) {
            uniqueProducts.add(productId);
          }
        } catch (error) {
          console.warn("Unable to resolve product for price", priceId, error);
        }
      }),
    );
    return Array.from(uniqueProducts);
  })();

  try {
    const created = await stripeClient.billingPortal.configurations.create({
      business_profile: {
        headline: "QuantPulse Billing",
        privacy_policy_url: `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/privacy`,
        terms_of_service_url: `${DEFAULT_SITE_URL.replace(/\/+$/, "")}/terms`,
      },
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["email", "address"],
        },
        invoice_history: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
        },
        subscription_pause: { enabled: false },
        payment_method_update: { enabled: true },
        subscription_update: productIds.length
          ? {
              enabled: true,
              default_allowed_updates: ["price", "quantity"],
              products: productIds,
              proration_behavior: "create_prorations",
            }
          : { enabled: false },
      },
    });
    return created.id ?? null;
  } catch (error) {
    console.error("Failed to create billing portal configuration", error);
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
    return internalError("Stripe is not configured");
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_error) {
    // allow empty payload
  }

  const returnUrl = typeof payload.return_url === "string" ? payload.return_url : null;
  const baseOrigin = resolveOriginFromRequest(req);
  const normalizedBase = baseOrigin.replace(/\/+$/, "");

  try {
    const metadata =
      (user.user_metadata as Record<string, unknown> | undefined) ??
      (user.raw_user_meta_data as Record<string, unknown> | undefined) ??
      {};

    const customerId = await ensureStripeCustomerId(stripe, user, metadata, { persist: false });

    const portalConfigurationId = await resolvePortalConfiguration(stripe);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: portalConfigurationId ?? undefined,
      return_url: normalizeUrl(returnUrl, `${normalizedBase}/account?from=stripe_portal`),
    });

    if (!session.url) {
      throw new Error("Billing portal session did not return a URL");
    }

    return json({ url: session.url });
  } catch (error) {
    return internalError(error);
  }
});

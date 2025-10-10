import { getSupabaseClient } from "./base44Client.js";
import { ApiError } from "./errors.js";
import { API_DEBUG } from "./config.js";

export const StripeApi = {
  async createCheckoutSession(payload = {}) {
    try {
      const client = getSupabaseClient();
      const headers = await buildAuthHeaders(client);
      const { data, error } = await client.functions.invoke("create-checkout-session", {
        body: payload,
        headers,
      });

      if (error) {
        const message = await parseFunctionError(error, "Failed to create checkout session");
        throw new ApiError(message, {
          status: error.status ?? 400,
          data: error,
        });
      }

      if (!data?.url) {
        throw new ApiError("Checkout session did not return a redirect URL.");
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError("Unable to create checkout session", { cause: error });
    }
  },
  async createBillingPortalSession(payload = {}) {
    try {
      const client = getSupabaseClient();
      const headers = await buildAuthHeaders(client);
      const { data, error } = await client.functions.invoke("create-billing-portal-session", {
        body: payload,
        headers,
      });

      if (error) {
        const message = await parseFunctionError(error, "Failed to create billing portal session");
        throw new ApiError(message, {
          status: error.status ?? 400,
          data: error,
        });
      }

      if (!data?.url) {
        throw new ApiError("Billing portal session did not return a redirect URL.");
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError("Unable to launch billing portal", { cause: error });
    }
  },
  async manageSubscription(payload = {}) {
    return invokeStripeFunction("manage-subscription", payload);
  },
  async changeSubscriptionPlan({
    plan_slug,
    billing_cycle,
    proration_behavior,
    upgrade_return_url,
    success_url,
    cancel_url,
  } = {}) {
    return invokeStripeFunction("manage-subscription", {
      action: "change_plan",
      plan_slug,
      billing_cycle,
      proration_behavior,
      upgrade_return_url,
      success_url,
      cancel_url,
    });
  },
  async scheduleDowngrade({ plan_slug, billing_cycle } = {}) {
    return invokeStripeFunction("manage-subscription", {
      action: "schedule_downgrade",
      plan_slug,
      billing_cycle,
    });
  },
  async cancelScheduledChange() {
    return invokeStripeFunction("manage-subscription", {
      action: "cancel_scheduled_change",
    });
  },
  async cancelSubscription({ cancel_now } = {}) {
    return invokeStripeFunction("manage-subscription", {
      action: "cancel",
      cancel_now: Boolean(cancel_now),
    });
  },
  async resumeSubscription() {
    return invokeStripeFunction("manage-subscription", { action: "resume" });
  },
};

const buildAuthHeaders = async (client) => {
  try {
    const { data } = await client.auth.getSession();
    const accessToken = data?.session?.access_token ?? null;
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  } catch (error) {
    if (API_DEBUG) {
      console.warn("Failed to read Supabase session for Stripe call", error);
    }
    return undefined;
  }
};

const parseFunctionError = async (functionsError, fallback) => {
  if (!functionsError?.context) {
    return functionsError?.message || fallback;
  }

  try {
    const cloned = functionsError.context.clone?.() ?? functionsError.context;
    if (cloned?.json) {
      const body = await cloned.json();
      if (body?.error) {
        return body.error;
      }
    } else if (cloned?.text) {
      const text = await cloned.text();
      if (text) {
        return text;
      }
    }
  } catch (parseError) {
    if (API_DEBUG) {
      console.warn("Failed to parse Supabase function error payload", parseError);
    }
  }

  return functionsError?.message || fallback;
};

const invokeStripeFunction = async (functionName, payload) => {
  try {
    const client = getSupabaseClient();
    const headers = await buildAuthHeaders(client);
    const { data, error } = await client.functions.invoke(functionName, {
      body: payload,
      headers,
    });
    if (error) {
      const message = await parseFunctionError(error, `Failed to invoke ${functionName}`);
      throw new ApiError(message, {
        status: error.status ?? 400,
        data: error,
      });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Unable to invoke ${functionName}`, { cause: error });
  }
};

import { getSupabaseClient } from "./base44Client.js";
import { ApiError } from "./errors.js";
import { API_DEBUG } from "./config.js";

const buildAuthHeaders = async (client) => {
  try {
    const { data } = await client.auth.getSession();
    const accessToken = data?.session?.access_token ?? null;
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  } catch (error) {
    if (API_DEBUG) {
      console.warn("Failed to obtain Supabase session for Stripe call", error);
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
      if (body?.error) return body.error;
    } else if (cloned?.text) {
      const text = await cloned.text();
      if (text) return text;
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

export const StripeApi = {
  async createCheckoutSession(payload = {}) {
    const data = await invokeStripeFunction("create-checkout-session", payload);
    if (!data?.url) {
      throw new ApiError("Checkout session did not return a redirect URL.");
    }
    return data;
  },
  async createBillingPortalSession(payload = {}) {
    const data = await invokeStripeFunction("create-billing-portal-session", payload);
    if (!data?.url) {
      throw new ApiError("Billing portal session did not return a redirect URL.");
    }
    return data;
  },
  async syncSubscription() {
    return invokeStripeFunction("manage-subscription", { action: "refresh" });
  },
  async resetSubscription() {
    return invokeStripeFunction("manage-subscription", { action: "reset" });
  },
};

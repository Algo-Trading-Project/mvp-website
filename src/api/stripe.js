import { getSupabaseClient } from "./base44Client.js";
import { ApiError } from "./errors.js";

export const StripeApi = {
  async createCheckoutSession(payload = {}) {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.functions.invoke("create-checkout-session", {
        body: payload,
      });

      if (error) {
        throw new ApiError(error.message || "Failed to create checkout session", {
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
};

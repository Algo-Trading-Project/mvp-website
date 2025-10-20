import { supabaseApi } from "./supabaseClient.js";
import { ApiError } from "./errors.js";

const wrapCall = async (label, fn) => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(`${label}: ${error.message}`, {
        status: error.status,
        data: error.data,
        requestId: error.requestId,
        cause: error,
      });
    }
    throw new ApiError(label, { cause: error });
  }
};

const wrapAuth = (auth) => ({
  me: (options) => wrapCall("Failed to fetch current user", () => auth.me(options ?? {})),
  signUp: (payload, options) =>
    wrapCall("Failed to sign up", () => auth.signUp(payload, options ?? {})),
  signIn: (payload, options) =>
    wrapCall("Failed to login", () => auth.signIn(payload, options ?? {})),
  resetPassword: (email) =>
    wrapCall("Failed to send password reset email", () => auth.resetPassword(email)),
  updatePassword: (password) =>
    wrapCall("Failed to update password", () => auth.updatePassword(password)),
  updateMyUserData: (updates, options) =>
    wrapCall("Failed to update user", () => auth.updateMyUserData(updates, options ?? {})),
  logout: (options) => wrapCall("Failed to logout", () => auth.logout(options ?? {})),
});

export const User = wrapAuth(supabaseApi.auth);

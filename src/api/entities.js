import { base44 } from "./base44Client.js";
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

const wrapEntity = (label, entity) => ({
  list: (options) => wrapCall(`Failed to list ${label}`, () => entity.list(options)),
  filter: (criteria, sortKey, limit, options) =>
    wrapCall(`Failed to filter ${label}`, () => entity.filter(criteria, sortKey, limit, options)),
  create: (payload, options) => wrapCall(`Failed to create ${label}`, () => entity.create(payload, options)),
});

const wrapAuth = (auth) => ({
  me: (options) => wrapCall("Failed to fetch current user", () => auth.me(options ?? {})),
  loginWithRedirect: (options) =>
    wrapCall("Failed to initiate login", () => auth.loginWithRedirect(options ?? {})),
  updateMyUserData: (updates, options) =>
    wrapCall("Failed to update user", () => auth.updateMyUserData(updates, options ?? {})),
  logout: (options) => wrapCall("Failed to logout", () => auth.logout(options ?? {})),
});

export const EmailCapture = wrapEntity("EmailCapture", base44.entities.EmailCapture);
export const ContactSubmission = wrapEntity("ContactSubmission", base44.entities.ContactSubmission);
export const predictions = wrapEntity("predictions", base44.entities.predictions);
export const spot_ohlcv_1d = wrapEntity("spot_ohlcv_1d", base44.entities.spot_ohlcv_1d);
export const symbol_ids = wrapEntity("symbol_ids", base44.entities.symbol_ids);
export const cross_sectional_metrics_1d = wrapEntity(
  "cross_sectional_metrics_1d",
  base44.entities.cross_sectional_metrics_1d
);
export const monthly_performance_metrics = wrapEntity(
  "monthly_performance_metrics",
  base44.entities.monthly_performance_metrics
);
export const User = wrapAuth(base44.auth);

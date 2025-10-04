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
  signUp: (payload, options) =>
    wrapCall("Failed to sign up", () => auth.signUp(payload, options ?? {})),
  signIn: (payload, options) =>
    wrapCall("Failed to login", () => auth.signIn(payload, options ?? {})),
  updateMyUserData: (updates, options) =>
    wrapCall("Failed to update user", () => auth.updateMyUserData(updates, options ?? {})),
  logout: (options) => wrapCall("Failed to logout", () => auth.logout(options ?? {})),
});

export const predictions = wrapEntity("predictions", base44.entities.predictions);
export const ohlcv_1d = wrapEntity("ohlcv_1d", base44.entities.ohlcv_1d);
export const cross_sectional_metrics_1d = wrapEntity(
  "cross_sectional_metrics_1d",
  base44.entities.cross_sectional_metrics_1d
);
export const monthly_performance_metrics = wrapEntity(
  "monthly_performance_metrics",
  base44.entities.monthly_performance_metrics
);
export const User = wrapAuth(base44.auth);

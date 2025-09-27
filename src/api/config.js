const envRaw = (() => {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }
  return {};
})();

const readEnv = (key, fallback = "") => {
  const value = envRaw?.[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value.trim();
  return String(value).trim();
};

export const API_BASE_URL = readEnv("VITE_API_BASE_URL");
export const API_TIMEOUT_MS = Number(readEnv("VITE_API_TIMEOUT_MS", "10000")) || 10000;
export const API_RETRY_COUNT = Math.max(0, Number(readEnv("VITE_API_RETRY_COUNT", "0")) || 0);

const inferMode = () => {
  const explicit = readEnv("VITE_API_MODE", "").toLowerCase();
  if (explicit === "network" || explicit === "mock") return explicit;
  return API_BASE_URL ? "network" : "mock";
};

export const API_MODE = inferMode();

export const API_DEBUG = readEnv("VITE_API_DEBUG", "false").toLowerCase() === "true";

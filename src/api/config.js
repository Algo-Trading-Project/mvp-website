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

export const API_DEBUG = readEnv("VITE_API_DEBUG", "false").toLowerCase() === "true";

export const SUPABASE_URL = readEnv("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = readEnv("VITE_SUPABASE_ANON_KEY");

const trimTrailingSlash = (value) => value.replace(/\/$/, "");

export const SUPABASE_FUNCTION_URL = (() => {
  const explicit = readEnv("VITE_SUPABASE_FUNCTION_URL");
  if (explicit) return trimTrailingSlash(explicit);
  if (!SUPABASE_URL) return "";
  return `${trimTrailingSlash(SUPABASE_URL)}/functions/v1`;
})();

export const SUPABASE_REST_URL = (() => {
  if (!SUPABASE_URL) return "";
  return `${trimTrailingSlash(SUPABASE_URL)}/rest/v1`;
})();

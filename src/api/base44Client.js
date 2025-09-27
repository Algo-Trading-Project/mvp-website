import { API_MODE, API_BASE_URL, API_DEBUG } from "./config.js";
import { httpClient } from "./httpClient.js";
import { mockClient } from "./mockClient.js";

const selectClient = () => {
  if (API_MODE === "network" && !API_BASE_URL) {
    console.warn("API_MODE is set to 'network' but VITE_API_BASE_URL is missing. Falling back to mock client.");
    return { client: mockClient, mode: "mock" };
  }
  if (API_MODE === "network") {
    return { client: httpClient, mode: "network" };
  }
  return { client: mockClient, mode: "mock" };
};

const { client: baseClient, mode: activeMode } = selectClient();

if (API_DEBUG) {
  console.info(`[api] using ${activeMode} client`);
}

export const base44 = baseClient;
export const apiRuntimeMode = activeMode;

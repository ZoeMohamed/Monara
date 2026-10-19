import { type ForecastSummary, forecastResponseSchema } from "@monara/contracts";

/** A forecast request that failed. The message is safe to show: it never carries record content. */
export class ForecastClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastClientError";
  }
}

async function request(
  method: "GET" | "POST",
  fetcher: typeof fetch,
  automatic = false,
): Promise<ForecastSummary | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ForecastClientError("You're offline. Reconnect, then try again.");
  }
  let response: Response;
  try {
    response = await fetcher("/api/forecast", {
      method,
      headers: automatic ? { "X-Forecast-Trigger": "daily" } : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(method === "POST" ? 60_000 : 20_000),
    });
  } catch {
    throw new ForecastClientError("The forecast could not be reached. Try again in a moment.");
  }
  if (response.status === 429) {
    throw new ForecastClientError("Too many requests. Try again in a moment.");
  }
  if (!response.ok) {
    throw new ForecastClientError(
      method === "POST"
        ? "The forecast could not be made. Try again."
        : "The forecast could not be loaded. Try again.",
    );
  }
  const parsed = forecastResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ForecastClientError("The forecast answer could not be verified. Try again.");
  }
  return parsed.data.forecast;
}

/** The latest forecast, or null before the first one. */
export const fetchForecast = (fetcher: typeof fetch = fetch) => request("GET", fetcher);

/** Makes a new forecast and returns it. */
export async function refreshForecast(
  fetcher: typeof fetch = fetch,
  automatic = false,
): Promise<ForecastSummary> {
  const forecast = await request("POST", fetcher, automatic);
  if (!forecast) throw new ForecastClientError("The forecast could not be made. Try again.");
  return forecast;
}

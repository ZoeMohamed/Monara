import {
  type ForecastCandidate,
  type ForecastJudgement,
  forecastRefineResponseSchema,
} from "@monara/contracts";
import type { RefineForecast } from "@monara/core";

const REFINE_TIMEOUT_MS = 25_000;

/**
 * Asks the Agent runtime's model to judge forecast candidates. Null whenever the Agent is not
 * configured or does not answer, so a forecast still comes out of the rules alone.
 */
export function refineWithAgent(
  env: { agentUrl?: string; secret?: string },
  fetcher: typeof fetch = fetch,
): RefineForecast {
  return async (candidates: ForecastCandidate[]): Promise<ForecastJudgement[] | null> => {
    const agentUrl = env.agentUrl?.trim();
    const secret = env.secret?.trim();
    if (!agentUrl || !secret) return null;
    try {
      const response = await fetcher(new URL("/forecast/refine", agentUrl), {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ candidates }),
        signal: AbortSignal.timeout(REFINE_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const parsed = forecastRefineResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      return parsed.success ? parsed.data.judgements : null;
    } catch {
      return null;
    }
  };
}

import {
  type BillReviewCandidate,
  type BillReviewJudgement,
  billReviewResponseSchema,
} from "@monara/contracts";

const REVIEW_TIMEOUT_MS = 25_000;

/**
 * Asks the Agent runtime's model whether detected bills are real bills (the AI check).
 * Null whenever the Agent is not configured or does not answer, so suggestions still come
 * from the rules alone.
 */
export function reviewBillsWithAgent(
  env: { agentUrl?: string; secret?: string },
  fetcher: typeof fetch = fetch,
): (candidates: BillReviewCandidate[]) => Promise<BillReviewJudgement[] | null> {
  return async (candidates) => {
    const agentUrl = env.agentUrl?.trim();
    const secret = env.secret?.trim();
    if (!agentUrl || !secret) return null;
    try {
      const response = await fetcher(new URL("/bills/review", agentUrl), {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ candidates }),
        signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const parsed = billReviewResponseSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data.judgements : null;
    } catch {
      return null;
    }
  };
}

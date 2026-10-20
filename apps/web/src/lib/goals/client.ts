import { type FinancialGoal, financialGoalSchema } from "@monara/contracts";

import { FinanceClientError } from "@/lib/finance/client";

export function goalImageUrl(goal: FinancialGoal): string | null {
  return goal.imagePath
    ? `/api/goals/${encodeURIComponent(goal.id)}/image?v=${encodeURIComponent(goal.updatedAt)}`
    : null;
}

export async function uploadGoalImage(
  goal: FinancialGoal,
  image: File,
  fetcher: typeof fetch = fetch,
): Promise<FinancialGoal> {
  const form = new FormData();
  form.set("expectedUpdatedAt", goal.updatedAt);
  form.set("image", image);
  let response: Response;
  try {
    response = await fetcher(`/api/goals/${encodeURIComponent(goal.id)}/image`, {
      body: form,
      cache: "no-store",
      credentials: "same-origin",
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      "The goal was saved, but its image could not be uploaded. Try editing it again.",
      null,
      true,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new FinanceClientError(
      response.status === 400
        ? "VALIDATION_FAILED"
        : response.status === 409
          ? "CONFLICT"
          : response.status === 401
            ? "UNAUTHENTICATED"
            : "DEPENDENCY_UNAVAILABLE",
      "The goal was saved, but its image could not be uploaded. Try editing it again.",
      response.status,
      response.status >= 500,
    );
  const parsed = financialGoalSchema.safeParse(body);
  if (!parsed.success)
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      "The image response could not be verified. Refresh your goals.",
      response.status,
      true,
    );
  return parsed.data;
}

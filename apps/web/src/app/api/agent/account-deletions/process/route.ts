import { FinanceOperationError } from "@monara/core";
import { hasAgentCredential } from "@/lib/agent/credential";
import { processUserDeletions } from "@/lib/auth/user-deletion";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    return financeSuccessResponse({ steps: await processUserDeletions() });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

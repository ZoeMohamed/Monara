import { userActivityInputSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";
import { hasAgentCredential } from "@/lib/agent/credential";
import { isUserActive } from "@/lib/auth/user-deletion";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    const { userId } = userActivityInputSchema.parse(await request.json());
    return financeSuccessResponse({ active: await isUserActive(userId) });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

import { FinanceOperationError } from "@monara/core";

import { hasAgentCredential } from "@/lib/agent/credential";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { budgetAlertService } from "@/lib/whatsapp/budget-alerts";

export const runtime = "nodejs";

/**
 * Sends WhatsApp budget alerts held back by quiet hours. The Agent's cron calls
 * it every 15 minutes; outside quiet hours it settles up to one batch.
 */
export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    return financeSuccessResponse({ settled: await budgetAlertService().dispatchQueued() });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

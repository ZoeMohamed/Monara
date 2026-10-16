import { FinanceOperationError } from "@monara/core";

import { hasAgentCredential } from "@/lib/agent/credential";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { whatsAppLinkService } from "@/lib/whatsapp/service";

export const runtime = "nodejs";

/**
 * Tells the Agent who a WhatsApp sender is (resolveWhatsAppSenderInputSchema).
 * The number is only a claim: a User is returned only for a verified link, or
 * when the message is the right code for a pending one.
 */
export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    return financeSuccessResponse(await whatsAppLinkService().resolveSender(await request.json()));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

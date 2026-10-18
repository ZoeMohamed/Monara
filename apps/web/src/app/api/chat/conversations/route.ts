import { FinanceOperationError } from "@monara/core";

import { chatHistoryService } from "@/lib/chat/service";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** The signed-in User's saved chats, newest first. The User comes from the session. */
export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return financeErrorResponse(
      new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."),
    );
  }
  try {
    return financeSuccessResponse(await chatHistoryService().conversations(identity.id));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

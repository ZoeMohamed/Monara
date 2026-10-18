import { FinanceOperationError } from "@monara/core";

import { chatHistoryService } from "@/lib/chat/service";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** The newest messages of one of the signed-in User's chats. Someone else's chat reads as empty. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return financeErrorResponse(
      new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."),
    );
  }
  try {
    const { conversationId } = await params;
    return financeSuccessResponse(await chatHistoryService().messages(identity.id, conversationId));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

import { financialAccountMutationResultSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";
import { after } from "next/server";

import {
  financeErrorResponse,
  financeSuccessResponse,
  isFinanceOperation,
  runFinanceOperation,
} from "@/lib/finance/service";
import { importAfterAccountLinked } from "@/lib/gmail/import";
import { syncUserTriggers } from "@/lib/gmail/trigger";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Whether an operation linked an account to a mailbox, and how. */
function linkReason(operation: string, input: unknown): "account_added" | "account_moved" | null {
  if (operation === "create_financial_account") return "account_added";
  if (operation !== "update_financial_account") return null;
  const changes =
    typeof input === "object" && input !== null && "changes" in input ? input.changes : null;
  return typeof changes === "object" && changes !== null && "gmailConnectionId" in changes
    ? "account_moved"
    : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return financeErrorResponse(
      new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."),
    );
  }
  const { operation } = await params;
  if (!isFinanceOperation(operation)) {
    return Response.json(
      { code: "NOT_FOUND", message: "That operation does not exist.", requestId: null },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const input: unknown = await request.json();
    const result = await runFinanceOperation(
      operation,
      { userId: identity.id, channel: "web", directSource: "manual_form" },
      input,
    );
    if (operation === "create_financial_account" || operation === "update_financial_account") {
      // Each mailbox's new-mail trigger follows the senders of the accounts it feeds.
      after(() => syncUserTriggers(identity.id).catch(() => undefined));
    }
    const reason = linkReason(operation, input);
    if (reason) {
      // The account's recent mail imports after the response; a failure shows on the mailbox.
      const changed = financialAccountMutationResultSchema.safeParse(result);
      if (changed.success) {
        const { financialAccount } = changed.data;
        after(() =>
          importAfterAccountLinked(identity.id, financialAccount, reason).catch(() => undefined),
        );
      }
    }
    return financeSuccessResponse(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

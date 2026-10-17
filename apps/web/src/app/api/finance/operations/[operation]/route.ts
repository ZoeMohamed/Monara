import { financialAccountMutationResultSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";
import { after } from "next/server";

import {
  financeErrorResponse,
  financeSuccessResponse,
  isFinanceOperation,
  runFinanceOperation,
} from "@/lib/finance/service";
import { importAfterAccountCreated } from "@/lib/gmail/import";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
    if (operation === "create_financial_account") {
      // The account's recent mail imports after the response; a failure shows on the mailbox.
      const created = financialAccountMutationResultSchema.safeParse(result);
      if (created.success) {
        const { financialAccount } = created.data;
        after(() =>
          importAfterAccountCreated(identity.id, financialAccount).catch(() => undefined),
        );
      }
    }
    return financeSuccessResponse(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

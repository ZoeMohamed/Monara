import { FinanceOperationError } from "@monara/core";

import {
  financeErrorResponse,
  financeSuccessResponse,
  isFinanceOperation,
  runFinanceOperation,
} from "@/lib/finance/service";
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
    return financeSuccessResponse(
      await runFinanceOperation(
        operation,
        { userId: identity.id, channel: "web", directSource: "manual_form" },
        input,
      ),
    );
  } catch (error) {
    return financeErrorResponse(error);
  }
}

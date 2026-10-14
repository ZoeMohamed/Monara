import { timingSafeEqual } from "node:crypto";

import { FinanceOperationError } from "@monara/core";

import {
  financeErrorResponse,
  financeSuccessResponse,
  isAgentFinanceOperation,
  isFinanceOperation,
  runFinanceOperation,
} from "@/lib/finance/service";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!authorized(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  const { operation } = await params;
  if (!isFinanceOperation(operation)) {
    return financeErrorResponse(
      new FinanceOperationError("NOT_FOUND", "That operation does not exist."),
    );
  }
  if (!isAgentFinanceOperation(operation)) {
    return financeErrorResponse(
      new FinanceOperationError(
        "FORBIDDEN",
        "Destructive actions require a bound confirmation flow.",
      ),
    );
  }
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.userId !== "string" ||
      (body.channel !== "web" && body.channel !== "whatsapp") ||
      !("input" in body)
    ) {
      throw new FinanceOperationError("VALIDATION_FAILED", "The request is not valid.");
    }
    return financeSuccessResponse(
      await runFinanceOperation(
        operation,
        {
          userId: body.userId,
          channel: body.channel,
          directSource: body.channel === "whatsapp" ? "whatsapp_text" : "in_app_chat",
        },
        body.input,
      ),
    );
  } catch (error) {
    return financeErrorResponse(error);
  }
}

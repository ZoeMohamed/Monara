import { type ChatExchange, retryChatHistorySchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";

import { verifyChatHistoryRecovery } from "@/lib/chat/history-recovery";
import { chatHistoryService } from "@/lib/chat/service";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/http/rate-limit";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BODY_MAX_BYTES = 210_000;

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > BODY_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const joined = new Uint8Array(bytes);
    let position = 0;
    for (const chunk of chunks) {
      joined.set(chunk, position);
      position += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Saves the exact signed reply only. No Agent call or financial operation is reachable here. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  const identity = await getAuthenticatedIdentity();
  if (!identity)
    return financeErrorResponse(
      new FinanceOperationError(
        "UNAUTHENTICATED",
        "Sign in again to save this chat. Copy the chat before leaving this page.",
      ),
    );
  const limited = checkRateLimit("chat-history", identity.id, RATE_LIMITS.finance);
  if (!limited.ok)
    return Response.json(
      {
        code: "RATE_LIMITED",
        message: "Give it a moment, then save history again. Your reply is still here.",
        requestId: null,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(limited.retryAfterSeconds),
        },
      },
    );
  const secret = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!secret)
    return financeErrorResponse(
      new FinanceOperationError(
        "DEPENDENCY_UNAVAILABLE",
        "History saving isn’t available. Keep this page open and try again later.",
      ),
    );
  const body = retryChatHistorySchema.safeParse(await readBody(request));
  if (!body.success)
    return financeErrorResponse(
      new FinanceOperationError(
        "VALIDATION_FAILED",
        "This saved reply couldn’t be verified. Copy the chat before leaving.",
      ),
    );
  let exchange: ChatExchange;
  try {
    exchange = verifyChatHistoryRecovery(body.data.recoveryToken, identity.id, secret);
  } catch (error) {
    return financeErrorResponse(
      new FinanceOperationError(
        "FORBIDDEN",
        error instanceof Error ? error.message : "This saved reply couldn’t be verified.",
      ),
    );
  }
  try {
    await chatHistoryService().saveExchange(identity.id, exchange, AbortSignal.timeout(5_000));
    return financeSuccessResponse({ status: "saved", exchangeId: exchange.exchangeId });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

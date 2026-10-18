import { webChatRequestSchema, webChatResponseSchema } from "@monara/contracts";
import { after } from "next/server";

import { chatHistoryService } from "@/lib/chat/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const HISTORY_SAVE_TIMEOUT_MS = 5_000;

function failure(status: number, code: string, message: string) {
  return Response.json({ code, message, requestId: null }, { status, headers });
}

/**
 * In-app chat bridge (F11). Verifies the signed-in User, then forwards the
 * message and earlier turns to the Agent runtime with the server-only secret.
 * The browser never supplies a userId; the server adds the verified one. Once
 * the Agent has answered, the exchange is saved so a reload finds it again.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return failure(403, "FORBIDDEN", "This request must come from Monara.");
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return failure(401, "UNAUTHENTICATED", "Sign in to continue.");

  const agentUrl = process.env.MONARA_AGENT_URL?.trim();
  const secret = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!agentUrl || !secret) {
    return failure(503, "DEPENDENCY_UNAVAILABLE", "Monara chat isn't available yet.");
  }

  const body = webChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return failure(400, "VALIDATION_FAILED", "Write a message to send.");

  const { conversationId, ...message } = body.data;
  let response: Response;
  try {
    response = await fetch(new URL("/chat", agentUrl), {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, userId: identity.id }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return failure(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Monara couldn't be reached. Check your records before trying again.",
    );
  }
  if (!response.ok) {
    return failure(
      502,
      "DEPENDENCY_UNAVAILABLE",
      "Monara couldn't answer. Check your records before trying again.",
    );
  }
  const result = webChatResponseSchema.safeParse(await response.json().catch(() => null));
  if (!result.success) {
    return failure(
      502,
      "DEPENDENCY_UNAVAILABLE",
      "Monara's answer couldn't be verified. Check your records before trying again.",
    );
  }
  // The Agent may already have changed records. Send its verified reply immediately;
  // Next keeps the invocation alive briefly to persist history after the response.
  after(async () => {
    try {
      await chatHistoryService().saveExchange(
        identity.id,
        { conversationId, text: message.text },
        result.data,
        AbortSignal.timeout(HISTORY_SAVE_TIMEOUT_MS),
      );
    } catch {
      // The chat still works; only its history is missing this exchange.
    }
  });
  return Response.json(result.data, { headers });
}

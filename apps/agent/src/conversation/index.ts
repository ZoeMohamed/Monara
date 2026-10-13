import { type AgentChatResponse, agentChatRequestSchema } from "@monara/contracts";
import type { Env } from "../env.ts";
import { createRespond } from "./respond.ts";

const encoder = new TextEncoder();

/** Compares two secrets without leaking where they differ. */
async function secretsMatch(received: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [received, expected].map(async (value) => {
      return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
    }),
  );
  if (!a || !b) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * In-app chat (F11). Only the Monara web backend may call this: it authenticates
 * the User's session and sends their id with the shared backend secret. The
 * Agent stores no conversation; the caller sends the earlier turns each time.
 */
export async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  const respond = createRespond(env);
  const secret = env.MONARA_AGENT_BACKEND_SECRET;
  if (!respond || !secret) {
    return Response.json({ error: "The Agent is not configured." }, { status: 503 });
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !(await secretsMatch(token, secret))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = agentChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Expected a userId and a text message." }, { status: 400 });
  }

  try {
    const response = await respond({
      // Only the web backend holds the secret checked above, so this is in-app chat.
      caller: { userId: body.data.userId, channel: "web" },
      history: body.data.history,
      text: body.data.text,
    });
    return Response.json(response satisfies AgentChatResponse);
  } catch {
    return Response.json({ error: "The Agent could not respond." }, { status: 502 });
  }
}

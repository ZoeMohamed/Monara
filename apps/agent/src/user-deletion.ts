import { userActivityInputSchema, userActivityResultSchema } from "@monara/contracts";
import type { Env } from "./env.ts";

/** Recheck at provider boundaries; never cache a User's permission to keep working. */
export function createUserIsActive(env: Env) {
  return async (userId: string): Promise<boolean> => {
    const baseUrl = env.MONARA_BACKEND_URL?.replace(/\/+$/, "");
    const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
    if (!baseUrl || !secret) throw new Error("Account status is not configured.");
    const response = await fetch(`${baseUrl}/api/agent/users/active`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Account status could not be verified.");
    return userActivityResultSchema.parse(await response.json()).active;
  };
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;
  const encoder = new TextEncoder();
  const hashes = await Promise.all(
    [token, secret].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
  const a = new Uint8Array(hashes[0]);
  const b = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

/** Only the backend may purge, and only after deletion has fenced the User. */
export async function handleUserPurge(request: Request, env: Env): Promise<Response> {
  const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!secret || !env.CONVERSATIONS)
    return Response.json({ error: "Cleanup is not configured." }, { status: 503 });
  if (!(await authorized(request, secret)))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const input = userActivityInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "The request is not valid." }, { status: 400 });
  try {
    if (await createUserIsActive(env)(input.data.userId)) {
      return Response.json({ error: "This account is still active." }, { status: 409 });
    }
    await env.CONVERSATIONS.get(env.CONVERSATIONS.idFromName(input.data.userId)).purge();
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Cleanup could not be completed." }, { status: 503 });
  }
}

/** Existing Worker scheduling wakes the backend's durable deletion jobs every minute. */
export async function processUserDeletions(env: Env): Promise<void> {
  const baseUrl = env.MONARA_BACKEND_URL?.replace(/\/+$/, "");
  const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!baseUrl || !secret) throw new Error("Account cleanup is not configured.");
  const response = await fetch(`${baseUrl}/api/agent/account-deletions/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error("Scheduled account cleanup failed.");
}

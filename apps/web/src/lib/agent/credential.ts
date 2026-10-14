import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * True only when the request carries the shared agent backend secret. Fails
 * closed when the secret is not configured. Digests keep the comparison
 * constant-time whatever the lengths.
 */
export function hasAgentCredential(request: Request): boolean {
  const expected = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!expected || !provided) return false;
  return timingSafeEqual(digest(expected), digest(provided));
}

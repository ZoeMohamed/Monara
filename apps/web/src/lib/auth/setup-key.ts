import { createHash } from "node:crypto";

/** Browser setup progress belongs to one identity, never to a reusable email address. */
export function setupKeyForUser(userId: string): string {
  return createHash("sha256").update(`monara-setup:${userId}`).digest("hex");
}

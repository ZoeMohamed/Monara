import { createHmac, timingSafeEqual } from "node:crypto";

export const DELETION_COOKIE = "monara-deletion";

function signature(userId: string, secret: string): string {
  if (!secret.trim()) throw new Error("Account deletion is not configured.");
  return createHmac("sha256", secret).update(`monara-user-deletion:${userId}`).digest("hex");
}

/** A status-only receipt survives session revocation. It never authorizes app access. */
export function deletionReceipt(userId: string, secret: string): string {
  return `${userId}.${signature(userId, secret)}`;
}

export function userIdFromDeletionReceipt(
  value: string | undefined,
  secret: string,
): string | null {
  if (!value || !secret.trim()) return null;
  const [userId, received, extra] = value.split(".");
  if (
    extra !== undefined ||
    !userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
    !received ||
    !/^[0-9a-f]{64}$/.test(received)
  )
    return null;
  return timingSafeEqual(
    Buffer.from(received, "hex"),
    Buffer.from(signature(userId, secret), "hex"),
  )
    ? userId
    : null;
}

// WhatsApp Link verification rules (PRD F12, docs/erd.md). Pure functions: the
// backend route loads and saves the whatsapp_links row, these decide what happens.
import type { WhatsAppCodeRejection } from "@monara/contracts";

/** A code is valid for ten minutes after the User asks to link. */
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
/** After this many wrong codes the User has to start linking again. */
export const MAX_VERIFICATION_ATTEMPTS = 5;

const CODE_DIGITS = 6;
const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  if (!secret) throw new Error("A WhatsApp Link secret is required.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares two digests without leaking where they differ. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Turns what a User typed into E.164, or null when it is not a full
 * international number. A leading 0 is ambiguous without a country, so it is
 * rejected instead of guessed.
 */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/**
 * The stored form of a number: a keyed hash for lookup and the last four digits
 * for display. The plain number is never stored.
 */
export async function protectPhone(
  phoneE164: string,
  secret: string,
): Promise<{ phoneE164Hmac: string; phoneLastFour: string }> {
  return {
    phoneE164Hmac: await hmacHex(secret, `phone:${phoneE164}`),
    phoneLastFour: phoneE164.slice(-4),
  };
}

// Bound to the number, so a code issued for one number is useless for another.
const digestCode = (code: string, phoneE164Hmac: string, secret: string) =>
  hmacHex(secret, `code:${phoneE164Hmac}:${code}`);

/**
 * Starts or restarts linking. Show `code` to the signed-in User once and store
 * only the digest; the User proves the number is theirs by sending the code
 * from it on WhatsApp.
 */
export async function createVerificationChallenge(input: {
  phoneE164Hmac: string;
  secret: string;
  now: Date;
}): Promise<{ code: string; codeDigest: string; expiresAt: string }> {
  // Rejection sampling keeps every code equally likely.
  const limit = 10 ** CODE_DIGITS;
  const ceiling = Math.floor(0x1_0000_0000 / limit) * limit;
  const buffer = new Uint32Array(1);
  let value = ceiling;
  while (value >= ceiling) {
    crypto.getRandomValues(buffer);
    value = buffer[0] ?? ceiling;
  }
  const code = String(value % limit).padStart(CODE_DIGITS, "0");
  return {
    code,
    codeDigest: await digestCode(code, input.phoneE164Hmac, input.secret),
    expiresAt: new Date(input.now.getTime() + VERIFICATION_TTL_MS).toISOString(),
  };
}

/** The whatsapp_links columns that verification reads. */
export interface PendingWhatsAppLink {
  phoneE164Hmac: string;
  verificationCodeDigest: string;
  verificationExpiresAt: string;
  verificationAttempts: number;
}

export type VerificationOutcome =
  // Mark the link verified and clear the challenge fields.
  | { verified: true }
  // Save `attempts`. When `locked`, also revoke the link so the code is dead.
  | { verified: false; reason: WhatsAppCodeRejection; attempts: number; locked: boolean };

/**
 * Checks a code sent from WhatsApp against a pending link. Expiry and the
 * attempt limit are checked before the code, so neither can be probed.
 */
export async function checkVerificationCode(input: {
  link: PendingWhatsAppLink;
  code: string;
  secret: string;
  now: Date;
}): Promise<VerificationOutcome> {
  const { link } = input;
  if (link.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    return {
      verified: false,
      reason: "too_many_attempts",
      attempts: link.verificationAttempts,
      locked: true,
    };
  }
  if (Date.parse(link.verificationExpiresAt) <= input.now.getTime()) {
    return {
      verified: false,
      reason: "expired",
      attempts: link.verificationAttempts,
      locked: false,
    };
  }
  const digest = await digestCode(input.code, link.phoneE164Hmac, input.secret);
  if (sameDigest(digest, link.verificationCodeDigest)) return { verified: true };
  const attempts = link.verificationAttempts + 1;
  const locked = attempts >= MAX_VERIFICATION_ATTEMPTS;
  return {
    verified: false,
    reason: locked ? "too_many_attempts" : "incorrect",
    attempts,
    locked,
  };
}

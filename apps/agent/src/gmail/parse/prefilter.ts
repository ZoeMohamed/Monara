import type { Institution } from "@monara/contracts";
import type { EmailForExtraction } from "../email-text.ts";

/**
 * Subjects that are never a transaction for any sender: one-time codes. Kept short on
 * purpose; a pattern that also matched a receipt would lose a real transaction.
 */
const NEVER_TRANSACTION_SUBJECTS = [
  /\bOTP\b/i,
  /\bone[- ]time (?:password|code)\b/i,
  /\bkode verifikasi\b/i,
  /\bverification code\b/i,
];

/**
 * Whether an email from a User's own institution is worth a model call. Subjects that
 * match the shared list or the institution's own skipSubjects are recorded as skipped.
 */
export function shouldParse(email: EmailForExtraction, institution: Institution): boolean {
  const subject = email.subject ?? "";
  if (!subject) return true;
  if (NEVER_TRANSACTION_SUBJECTS.some((pattern) => pattern.test(subject))) return false;
  return !(institution.skipSubjects ?? []).some((pattern) =>
    new RegExp(pattern, "i").test(subject),
  );
}

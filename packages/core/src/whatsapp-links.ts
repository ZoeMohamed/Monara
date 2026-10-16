// WhatsApp Link service (PRD F12): a signed-in User starts linking a number in
// the app, then proves it is theirs by sending the code from it on WhatsApp.
// The rules for codes live in whatsapp-link.ts; this decides what is stored.
import {
  type ResolveWhatsAppSenderResult,
  resolveWhatsAppSenderInputSchema,
  type StartWhatsAppLinkResult,
  startWhatsAppLinkInputSchema,
  type WhatsAppCodeRejection,
  type WhatsAppLinkStatus,
} from "@monara/contracts";
import { FinanceOperationError } from "./finance.ts";
import {
  checkVerificationCode,
  createVerificationChallenge,
  normalisePhone,
  protectPhone,
} from "./whatsapp-link.ts";

export interface StoredWhatsAppLink {
  id: string;
  userId: string;
  phoneE164Hmac: string;
  phoneLastFour: string;
  status: "pending" | "verified" | "revoked";
  verificationCodeDigest: string | null;
  verificationExpiresAt: string | null;
  verificationAttempts: number;
  verifiedAt: string | null;
}

export interface WhatsAppLinkRepository {
  findByUser(userId: string): Promise<StoredWhatsAppLink | null>;
  /** Pending and verified links for a number, oldest first. */
  findActiveByPhone(phoneE164Hmac: string): Promise<StoredWhatsAppLink[]>;
  /** Starts or restarts the User's one link with a fresh challenge. */
  savePending(input: {
    userId: string;
    phoneE164Hmac: string;
    phoneLastFour: string;
    codeDigest: string;
    expiresAt: string;
  }): Promise<void>;
  markVerified(input: { id: string; verifiedAt: string }): Promise<void>;
  recordFailedAttempt(input: { id: string; attempts: number; revoke: boolean }): Promise<void>;
  touchInbound(input: { id: string; at: string }): Promise<void>;
  revoke(userId: string): Promise<void>;
}

export type WhatsAppLinkService = ReturnType<typeof createWhatsAppLinkService>;

export function createWhatsAppLinkService(input: {
  repository: WhatsAppLinkRepository;
  secret: string | undefined;
  /** Monara's own WhatsApp number in E.164, shown to the User. */
  monaraNumber?: string | undefined;
  now?: () => Date;
}) {
  const { repository } = input;
  const now = input.now ?? (() => new Date());
  const secret = () => {
    const value = input.secret?.trim();
    if (!value) {
      throw new FinanceOperationError(
        "DEPENDENCY_UNAVAILABLE",
        "WhatsApp linking isn't available yet.",
      );
    }
    return value;
  };
  const sendTo = normalisePhone(input.monaraNumber ?? "");

  return {
    async status(userId: string): Promise<WhatsAppLinkStatus> {
      const link = await repository.findByUser(userId);
      if (link?.status === "verified" && link.verifiedAt) {
        return {
          status: "verified",
          phoneLastFour: link.phoneLastFour,
          verifiedAt: link.verifiedAt,
        };
      }
      if (link?.status === "pending" && link.verificationExpiresAt) {
        return {
          status: "pending",
          phoneLastFour: link.phoneLastFour,
          expiresAt: link.verificationExpiresAt,
        };
      }
      return { status: "none" };
    },

    /** Replaces any earlier link of this User. The code is returned once and never stored. */
    async start(userId: string, body: unknown): Promise<StartWhatsAppLinkResult> {
      const key = secret();
      const phoneE164 = normalisePhone(startWhatsAppLinkInputSchema.parse(body).phone);
      if (!phoneE164) {
        throw new FinanceOperationError(
          "VALIDATION_FAILED",
          "Enter the full number with its country code, like +62 812 3456 7890.",
        );
      }
      const { phoneE164Hmac, phoneLastFour } = await protectPhone(phoneE164, key);
      const existing = await repository.findActiveByPhone(phoneE164Hmac);
      if (existing.some((link) => link.status === "verified" && link.userId !== userId)) {
        throw new FinanceOperationError(
          "CONFLICT",
          "That number is already linked to another Monara account.",
        );
      }
      const challenge = await createVerificationChallenge({
        phoneE164Hmac,
        secret: key,
        now: now(),
      });
      await repository.savePending({
        userId,
        phoneE164Hmac,
        phoneLastFour,
        codeDigest: challenge.codeDigest,
        expiresAt: challenge.expiresAt,
      });
      return { code: challenge.code, expiresAt: challenge.expiresAt, phoneLastFour, sendTo };
    },

    async unlink(userId: string): Promise<void> {
      await repository.revoke(userId);
    },

    /**
     * Who a WhatsApp sender is. Called by the Agent for every inbound message;
     * the number is only a claim until a verified link matches it.
     */
    async resolveSender(body: unknown): Promise<ResolveWhatsAppSenderResult> {
      const key = secret();
      const { phoneE164, verificationCode } = resolveWhatsAppSenderInputSchema.parse(body);
      const { phoneE164Hmac } = await protectPhone(phoneE164, key);
      const links = await repository.findActiveByPhone(phoneE164Hmac);
      const at = now();

      const verified = links.find((link) => link.status === "verified");
      if (verified) {
        await repository.touchInbound({ id: verified.id, at: at.toISOString() });
        return { status: "linked", userId: verified.userId };
      }
      if (!verificationCode) return { status: "unlinked" };

      let reason: WhatsAppCodeRejection | null = null;
      for (const link of links) {
        if (link.status !== "pending" || !link.verificationCodeDigest) continue;
        if (!link.verificationExpiresAt) continue;
        const outcome = await checkVerificationCode({
          link: {
            phoneE164Hmac: link.phoneE164Hmac,
            verificationCodeDigest: link.verificationCodeDigest,
            verificationExpiresAt: link.verificationExpiresAt,
            verificationAttempts: link.verificationAttempts,
          },
          code: verificationCode,
          secret: key,
          now: at,
        });
        if (outcome.verified) {
          await repository.markVerified({ id: link.id, verifiedAt: at.toISOString() });
          return { status: "verified", userId: link.userId };
        }
        if (outcome.attempts !== link.verificationAttempts || outcome.locked) {
          await repository.recordFailedAttempt({
            id: link.id,
            attempts: outcome.attempts,
            revoke: outcome.locked,
          });
        }
        reason = outcome.reason;
      }
      return reason ? { status: "code_rejected", reason } : { status: "unlinked" };
    },
  };
}

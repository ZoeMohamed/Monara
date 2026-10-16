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

/** How often one code check re-reads the link when concurrent attempts race it. */
const CLAIM_RETRIES = 3;

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
  /**
   * Counts one code attempt: raises the count from `attempts` by one only while the
   * link is still pending with this challenge and that count. False when another
   * request or a new challenge got there first.
   */
  claimAttempt(input: { id: string; codeDigest: string; attempts: number }): Promise<boolean>;
  /** Verifies the link only while it still holds this challenge. False when it does not. */
  markVerified(input: { id: string; codeDigest: string; verifiedAt: string }): Promise<boolean>;
  /** Revokes a pending link locked by too many attempts, only while it holds this challenge. */
  lockPending(input: { id: string; codeDigest: string }): Promise<void>;
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
      for (const found of links) {
        const outcome = await tryCode(found, verificationCode, key, at);
        if (outcome === "verified") return { status: "verified", userId: found.userId };
        reason = outcome ?? reason;
      }
      return reason ? { status: "code_rejected", reason } : { status: "unlinked" };
    },
  };

  /**
   * Checks one code against one pending link. A guess counts before its result is
   * used, through a compare-and-set on the attempt count, so concurrent messages
   * cannot try more than the allowed number of codes. Null when the link has no
   * live challenge.
   */
  async function tryCode(
    found: StoredWhatsAppLink,
    code: string,
    key: string,
    at: Date,
  ): Promise<"verified" | WhatsAppCodeRejection | null> {
    let link: StoredWhatsAppLink | null = found;
    for (let round = 0; round < CLAIM_RETRIES; round++) {
      if (link?.status !== "pending" || link.phoneE164Hmac !== found.phoneE164Hmac) return null;
      const codeDigest = link.verificationCodeDigest;
      if (!codeDigest || !link.verificationExpiresAt) return null;
      const outcome = await checkVerificationCode({
        link: {
          phoneE164Hmac: link.phoneE164Hmac,
          verificationCodeDigest: codeDigest,
          verificationExpiresAt: link.verificationExpiresAt,
          verificationAttempts: link.verificationAttempts,
        },
        code,
        secret: key,
        now: at,
      });
      // Expired, or already locked: nothing to count.
      if (!outcome.verified && outcome.attempts === link.verificationAttempts) {
        if (outcome.locked) await repository.lockPending({ id: link.id, codeDigest });
        return outcome.reason;
      }
      const claimed = await repository.claimAttempt({
        id: link.id,
        codeDigest,
        attempts: link.verificationAttempts,
      });
      if (claimed) {
        if (outcome.verified) {
          const verified = await repository.markVerified({
            id: link.id,
            codeDigest,
            verifiedAt: at.toISOString(),
          });
          return verified ? "verified" : "incorrect";
        }
        if (outcome.locked) await repository.lockPending({ id: link.id, codeDigest });
        return outcome.reason;
      }
      link = await repository.findByUser(link.userId);
    }
    // Still racing after the retries: reject without saying whether the code was right.
    return "incorrect";
  }
}

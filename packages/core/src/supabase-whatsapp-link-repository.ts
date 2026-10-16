import type { MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError } from "./finance.ts";
import type { StoredWhatsAppLink, WhatsAppLinkRepository } from "./whatsapp-links.ts";

const COLUMNS =
  "id, user_id, phone_e164_hmac, phone_last_four, status, verification_code_digest, verification_expires_at, verification_attempts, verified_at";

interface LinkRow {
  id: string;
  user_id: string;
  phone_e164_hmac: string;
  phone_last_four: string;
  status: string;
  verification_code_digest: string | null;
  verification_expires_at: string | null;
  verification_attempts: number;
  verified_at: string | null;
}

function fail(): never {
  throw new FinanceOperationError("INTERNAL", "The WhatsApp Link could not be saved.");
}

function toLink(row: LinkRow): StoredWhatsAppLink {
  if (row.status !== "pending" && row.status !== "verified" && row.status !== "revoked") fail();
  return {
    id: row.id,
    userId: row.user_id,
    phoneE164Hmac: row.phone_e164_hmac,
    phoneLastFour: row.phone_last_four,
    status: row.status,
    verificationCodeDigest: row.verification_code_digest,
    verificationExpiresAt: row.verification_expires_at,
    verificationAttempts: row.verification_attempts,
    verifiedAt: row.verified_at,
  };
}

/**
 * whatsapp_links through the service-role client. Callers must already have
 * verified the User (a signed-in session) or the Agent (its shared secret).
 */
export function createSupabaseWhatsAppLinkRepository(
  client: MonaraServiceRoleClient,
): WhatsAppLinkRepository {
  return {
    async findByUser(userId) {
      const result = await client
        .from("whatsapp_links")
        .select(COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) fail();
      return result.data ? toLink(result.data) : null;
    },

    async findActiveByPhone(phoneE164Hmac) {
      const result = await client
        .from("whatsapp_links")
        .select(COLUMNS)
        .eq("phone_e164_hmac", phoneE164Hmac)
        .in("status", ["pending", "verified"])
        .order("created_at", { ascending: true });
      if (result.error) fail();
      return result.data.map(toLink);
    },

    async savePending(input) {
      const result = await client.from("whatsapp_links").upsert(
        {
          user_id: input.userId,
          phone_e164_hmac: input.phoneE164Hmac,
          phone_last_four: input.phoneLastFour,
          kapso_contact_id: null,
          status: "pending",
          verification_code_digest: input.codeDigest,
          verification_expires_at: input.expiresAt,
          verification_attempts: 0,
          verified_at: null,
          last_inbound_at: null,
        },
        { onConflict: "user_id" },
      );
      if (result.error) fail();
    },

    async markVerified(input) {
      const result = await client
        .from("whatsapp_links")
        .update({
          status: "verified",
          verification_code_digest: null,
          verification_expires_at: null,
          verification_attempts: 0,
          verified_at: input.verifiedAt,
          last_inbound_at: input.verifiedAt,
        })
        .eq("id", input.id)
        .eq("status", "pending");
      if (result.error) fail();
    },

    async recordFailedAttempt(input) {
      const result = await client
        .from("whatsapp_links")
        .update(
          input.revoke
            ? {
                status: "revoked",
                verification_code_digest: null,
                verification_expires_at: null,
                verification_attempts: input.attempts,
              }
            : { verification_attempts: input.attempts },
        )
        .eq("id", input.id)
        .eq("status", "pending");
      if (result.error) fail();
    },

    async touchInbound(input) {
      const result = await client
        .from("whatsapp_links")
        .update({ last_inbound_at: input.at })
        .eq("id", input.id);
      if (result.error) fail();
    },

    async revoke(userId) {
      const result = await client
        .from("whatsapp_links")
        .update({
          status: "revoked",
          verification_code_digest: null,
          verification_expires_at: null,
        })
        .eq("user_id", userId)
        .neq("status", "revoked");
      if (result.error) fail();
    },
  };
}

import type { MonaraServiceRoleClient } from "@monara/db";
import { BUDGET_ALERT_TEMPLATE, type BudgetAlertRepository } from "./budget-alerts.ts";
import { FinanceOperationError } from "./finance.ts";

/** Database errors can echo records, so only a generic error leaves this module. */
function fail(): never {
  throw new FinanceOperationError("INTERNAL", "The WhatsApp Reminder could not be saved.");
}

/**
 * reminder_deliveries, whatsapp_links and reminder_preferences through the
 * service-role client. Every query is scoped to the User the Reminder belongs to.
 */
export function createSupabaseBudgetAlertRepository(
  client: MonaraServiceRoleClient,
): BudgetAlertRepository {
  return {
    async findRecipient(userId) {
      const preferences = await client
        .from("reminder_preferences")
        .select("whatsapp_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (preferences.error) fail();
      if (!preferences.data?.whatsapp_enabled) return null;
      const link = await client
        .from("whatsapp_links")
        .select("phone_e164_ciphertext")
        .eq("user_id", userId)
        .eq("status", "verified")
        .maybeSingle();
      if (link.error) fail();
      const phoneCiphertext = link.data?.phone_e164_ciphertext;
      return phoneCiphertext ? { phoneCiphertext } : null;
    },

    async reserve({ userId, reminderId }) {
      const result = await client
        .from("reminder_deliveries")
        .insert({
          user_id: userId,
          reminder_id: reminderId,
          channel: "whatsapp",
          status: "queued",
          template_name: BUDGET_ALERT_TEMPLATE,
        })
        .select("id")
        .single();
      // reminder_deliveries_reminder_channel_key: another call reserved it first.
      if (result.error?.code === "23505") {
        const existing = await client
          .from("reminder_deliveries")
          .select("id")
          .eq("user_id", userId)
          .eq("reminder_id", reminderId)
          .eq("channel", "whatsapp")
          .maybeSingle();
        if (existing.error) fail();
        return existing.data?.id ?? null;
      }
      if (result.error) fail();
      return result.data.id;
    },

    async claim({ id, userId, attemptedAt, reclaimBefore }) {
      const result = await client
        .from("reminder_deliveries")
        .update({ attempted_at: attemptedAt })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "queued")
        .or(`attempted_at.is.null,attempted_at.lt.${reclaimBefore}`)
        .select("id");
      if (result.error) fail();
      return result.data.length === 1;
    },

    async releaseClaim({ id, userId, attemptedAt }) {
      const result = await client
        .from("reminder_deliveries")
        .update({ attempted_at: null })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "queued")
        .eq("attempted_at", attemptedAt);
      if (result.error) fail();
    },

    async markSending({ id, userId, attemptedAt }) {
      const result = await client
        .from("reminder_deliveries")
        .update({ status: "sending" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "queued")
        .eq("attempted_at", attemptedAt)
        .select("id");
      if (result.error) fail();
      return result.data.length === 1;
    },

    async abandonStaleSending(before) {
      const result = await client
        .from("reminder_deliveries")
        .update({ status: "failed", failure_code: "delivery_outcome_unknown" })
        .eq("status", "sending")
        .lt("attempted_at", before)
        .select("id");
      if (result.error) fail();
      return result.data.length;
    },

    async countAttemptedSince(userId, since) {
      const result = await client
        .from("reminder_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["sent", "queued", "sending"])
        .gte("attempted_at", since);
      if (result.error) fail();
      return result.count ?? 0;
    },

    async settle({ id, userId, outcome }) {
      const result = await client
        .from("reminder_deliveries")
        .update({
          status: outcome.status,
          provider_message_id: outcome.providerMessageId,
          failure_code: outcome.failureCode,
          sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["queued", "sending"]);
      if (result.error) fail();
    },

    async listQueued(limit, reclaimBefore) {
      const result = await client
        .from("reminder_deliveries")
        .select("id, user_id, reminder_id")
        .eq("status", "queued")
        .or(`attempted_at.is.null,attempted_at.lt.${reclaimBefore}`)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (result.error) fail();
      return result.data.map((row) => ({
        id: row.id,
        userId: row.user_id,
        reminderId: row.reminder_id,
      }));
    },
  };
}

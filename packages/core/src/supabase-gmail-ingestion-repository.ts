// Supabase-backed GmailIngestionRepository. The Gmail tables are service-role
// only. Claims and records go through Postgres functions so each is one locked
// transaction (supabase/migrations/20261014123514_gmail_ingestion_operations.sql).
import {
  claimGmailMessageResultSchema,
  gmailSyncCountsSchema,
  listActiveGmailConnectionsResultSchema,
  recordGmailExtractionResultSchema,
  resolvedGmailConnectionSchema,
} from "@monara/contracts";
import type { MonaraServiceRoleClient } from "@monara/db";
import {
  connectionNotActive,
  GmailIngestionError,
  type GmailIngestionRepository,
} from "./gmail-ingestion.ts";

/** Postgres error codes are safe to inspect; messages and details are not returned. */
function fail(error: { code?: string }): never {
  if (error.code === "P0002") throw connectionNotActive();
  if (error.code === "22023" || error.code === "22P02" || error.code === "23514") {
    throw new GmailIngestionError("VALIDATION_FAILED", "The request is not valid.");
  }
  throw new GmailIngestionError("INTERNAL", "The Gmail operation could not be completed.");
}

export function createSupabaseGmailIngestionRepository(
  client: MonaraServiceRoleClient,
): GmailIngestionRepository {
  return {
    async listActiveConnections() {
      const { data, error } = await client
        .from("gmail_connections")
        .select("id, last_synced_at")
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) fail(error);
      return listActiveGmailConnectionsResultSchema.parse({
        connections: data.map((row) => ({
          connectionId: row.id,
          lastSyncedAt: row.last_synced_at,
        })),
      });
    },

    async resolveConnection(connectionId) {
      const connection = await client
        .from("gmail_connections")
        .select("id, user_id, composio_connected_account_id")
        .eq("id", connectionId)
        .eq("status", "active")
        .maybeSingle();
      if (connection.error) fail(connection.error);
      if (!connection.data) throw connectionNotActive();

      const categories = await client
        .from("categories")
        .select("name")
        .eq("user_id", connection.data.user_id)
        .eq("is_archived", false)
        .order("name", { ascending: true })
        .limit(200);
      if (categories.error) fail(categories.error);

      return resolvedGmailConnectionSchema.parse({
        connectionId: connection.data.id,
        userId: connection.data.user_id,
        composioConnectedAccountId: connection.data.composio_connected_account_id,
        categoryNames: categories.data.map((category) => category.name),
      });
    },

    async claimMessage(input) {
      const { data, error } = await client
        .rpc("claim_gmail_message", {
          p_connection_id: input.connectionId,
          p_gmail_message_id: input.gmailMessageId,
          p_received_at: input.receivedAt,
        })
        .single();
      if (error) fail(error);
      return claimGmailMessageResultSchema.parse({
        processedMessageId: data.processed_message_id,
        alreadyFinished: data.already_finished,
      });
    },

    async recordExtraction(input) {
      const { data, error } = await client
        .rpc("record_gmail_extraction", {
          p_processed_message_id: input.processedMessageId,
          p_outcome: input.outcome,
          p_items: input.items,
        })
        .single();
      if (error) fail(error);
      return recordGmailExtractionResultSchema.parse({
        transactionIds: data.transaction_ids,
        alreadyFinished: data.already_finished,
      });
    },

    async markSynced(input) {
      const { error } = await client.rpc("mark_gmail_connection_synced", {
        p_connection_id: input.connectionId,
        p_synced_at: input.syncedAt,
      });
      if (error) fail(error);
    },

    async markError(connectionId) {
      const { data, error } = await client
        .from("gmail_connections")
        .update({ status: "error" })
        .eq("id", connectionId)
        .eq("status", "active")
        .select("id");
      if (error) fail(error);
      if (data.length === 0) throw connectionNotActive();
    },

    async syncCounts(userId, connectionId) {
      const { data, error } = await client
        .rpc("gmail_connection_sync_counts", {
          p_user_id: userId,
          p_connection_id: connectionId,
        })
        .maybeSingle();
      if (error) fail(error);
      if (!data) {
        throw new GmailIngestionError("NOT_FOUND", "That Gmail connection was not found.");
      }
      return gmailSyncCountsSchema.parse({
        imported: data.imported,
        skipped: data.skipped,
        failed: data.failed,
        inProgress: data.in_progress,
        importedTransactions: data.imported_transactions,
      });
    },
  };
}

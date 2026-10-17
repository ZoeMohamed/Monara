// Supabase-backed GmailIngestionRepository. The Gmail tables are service-role
// only. Claims and records go through Postgres functions so each is one locked
// transaction (supabase/migrations/20261014123514_gmail_ingestion_operations.sql).
import {
  claimGmailMessageResultSchema,
  claimGmailMessagesResultSchema,
  claimMerchantProfileResultSchema,
  findInstitution,
  gmailDiscoverySchema,
  gmailSyncCountsSchema,
  listActiveGmailConnectionsResultSchema,
  merchantKey,
  recordGmailExtractionResultSchema,
  resolvedGmailConnectionSchema,
  resolvedImportedTransactionSchema,
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
  if (error.code === "55000") {
    throw new GmailIngestionError("CONFLICT", "A Gmail sync is already running.");
  }
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

      const [categories, accounts] = await Promise.all([
        client
          .from("categories")
          .select("name")
          .eq("user_id", connection.data.user_id)
          .eq("is_archived", false)
          .order("name", { ascending: true })
          .limit(200),
        client
          .from("financial_accounts")
          .select("institution_key")
          .eq("user_id", connection.data.user_id)
          .eq("is_active", true)
          .not("institution_key", "is", null)
          .limit(100),
      ]);
      if (categories.error) fail(categories.error);
      if (accounts.error) fail(accounts.error);

      return resolvedGmailConnectionSchema.parse({
        connectionId: connection.data.id,
        userId: connection.data.user_id,
        composioConnectedAccountId: connection.data.composio_connected_account_id,
        categoryNames: categories.data.map((category) => category.name),
        // Keys no longer in the registry are ignored rather than failing the sync.
        institutionKeys: [
          ...new Set(
            accounts.data.flatMap((account) =>
              account.institution_key !== null && findInstitution(account.institution_key)
                ? [account.institution_key]
                : [],
            ),
          ),
        ],
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
          p_institution_key: input.institutionKey ?? undefined,
          p_sender_verified: input.senderVerified,
        })
        .single();
      if (error) fail(error);
      const result = recordGmailExtractionResultSchema.parse({
        transactionIds: data.transaction_ids,
        alreadyFinished: data.already_finished,
        uncategorizedTransactionIds: data.uncategorized_transaction_ids,
      });

      // The owner and the confirmed items come from the stored rows, never from the caller.
      const message = await client
        .from("processed_gmail_messages")
        .select("user_id")
        .eq("id", input.processedMessageId)
        .single();
      if (message.error) fail(message.error);
      let confirmedTransactionIds: string[] = [];
      if (result.transactionIds.length > 0) {
        const confirmed = await client
          .from("transactions")
          .select("id")
          .eq("user_id", message.data.user_id)
          .eq("review_status", "confirmed")
          .in("id", result.transactionIds);
        if (confirmed.error) fail(confirmed.error);
        confirmedTransactionIds = confirmed.data.map((row) => row.id);
      }
      return { ...result, userId: message.data.user_id, confirmedTransactionIds };
    },

    async startSync(connectionId) {
      const { error } = await client.rpc("start_gmail_sync", { p_connection_id: connectionId });
      if (error) fail(error);
    },

    async claimMessages(input) {
      const { data, error } = await client.rpc("claim_gmail_messages", {
        p_connection_id: input.connectionId,
        p_messages: input.messages,
      });
      if (error) fail(error);
      const ids = input.messages.map((message) => message.gmailMessageId);
      const pending =
        data === 0 || ids.length === 0
          ? { data: [], error: null }
          : await client
              .from("processed_gmail_messages")
              .select("id, gmail_message_id")
              .eq("gmail_connection_id", input.connectionId)
              .in("gmail_message_id", ids)
              .in("processing_status", ["processing", "failed"]);
      if (pending.error) fail(pending.error);
      return claimGmailMessagesResultSchema.parse({
        pendingGmailMessageIds: pending.data.map((row) => row.gmail_message_id),
        pending: pending.data.map((row) => ({
          gmailMessageId: row.gmail_message_id,
          processedMessageId: row.id,
        })),
      });
    },

    async failSync({ connectionId, error: reason, requestedAt }) {
      const { error } = await client.rpc("fail_gmail_sync", {
        p_connection_id: connectionId,
        p_error: reason,
        ...(requestedAt === undefined ? {} : { p_requested_at: requestedAt }),
      });
      if (error) fail(error);
    },

    async requestSync(userId, connectionId) {
      const { data, error } = await client.rpc("request_gmail_sync", {
        p_user_id: userId,
        p_connection_id: connectionId,
      });
      if (error) fail(error);
      return data;
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

    async startDiscovery(connectionId) {
      const { error } = await client.rpc("start_gmail_discovery", {
        p_connection_id: connectionId,
      });
      if (error) fail(error);
    },

    async discoveryStatus(connectionId) {
      const { data, error } = await client
        .from("gmail_connections")
        .select("discovery_state, discovery_updated_at")
        .eq("id", connectionId)
        .eq("status", "active")
        .maybeSingle();
      if (error) fail(error);
      if (!data) throw connectionNotActive();
      return {
        state: gmailDiscoverySchema.shape.state.parse(data.discovery_state),
        updatedAt: data.discovery_updated_at,
      };
    },

    async recordDiscovery(input) {
      const { error } = await client.rpc("record_gmail_discovery", {
        p_connection_id: input.connectionId,
        p_found: input.findings,
      });
      if (error) fail(error);
    },

    async failDiscovery(connectionId) {
      const { error } = await client.rpc("fail_gmail_discovery", {
        p_connection_id: connectionId,
      });
      if (error) fail(error);
    },

    async discoveryFor(userId, connectionId) {
      const [connection, findings, accounts] = await Promise.all([
        client
          .from("gmail_connections")
          .select("discovery_state")
          .eq("id", connectionId)
          .eq("user_id", userId)
          .maybeSingle(),
        client
          .from("gmail_institution_discoveries")
          .select("institution_key, email_count, last_fours")
          .eq("gmail_connection_id", connectionId)
          .eq("user_id", userId)
          .order("email_count", { ascending: false }),
        client
          .from("financial_accounts")
          .select("id, name, institution_key")
          .eq("user_id", userId)
          .eq("is_active", true)
          .not("institution_key", "is", null),
      ]);
      if (connection.error) fail(connection.error);
      if (findings.error) fail(findings.error);
      if (accounts.error) fail(accounts.error);
      if (!connection.data) {
        throw new GmailIngestionError("NOT_FOUND", "That Gmail connection was not found.");
      }
      return gmailDiscoverySchema.parse({
        state: connection.data.discovery_state,
        suggestions: findings.data.flatMap((finding) => {
          const institution = findInstitution(finding.institution_key);
          if (!institution) return [];
          return [
            {
              institutionKey: institution.key,
              name: institution.name,
              provider: institution.provider,
              platform: institution.platform,
              emailCount: finding.email_count,
              lastFours: finding.last_fours,
              linkedAccounts: accounts.data
                .filter((account) => account.institution_key === institution.key)
                .map((account) => ({ id: account.id, name: account.name })),
            },
          ];
        }),
      });
    },

    async resolveImportedTransaction(transactionId) {
      const item = await client
        .rpc("imported_transaction_for_category", { p_transaction_id: transactionId })
        .maybeSingle();
      if (item.error) fail(item.error);
      if (!item.data) {
        throw new GmailIngestionError("NOT_FOUND", "That imported transaction was not found.");
      }
      const categories = await client
        .from("categories")
        .select("name")
        .eq("user_id", item.data.user_id)
        .eq("is_archived", false)
        .order("name", { ascending: true })
        .limit(200);
      if (categories.error) fail(categories.error);
      return resolvedImportedTransactionSchema.parse({
        merchantName: item.data.merchant_name,
        location: item.data.location,
        needsCategory: item.data.needs_category,
        categoryNames: categories.data.map((category) => category.name),
      });
    },

    async claimMerchantProfile(merchantName) {
      const { data, error } = await client
        .rpc("claim_merchant_profile", { p_merchant_key: merchantKey(merchantName) })
        .single();
      if (error) fail(error);
      return claimMerchantProfileResultSchema.parse(
        data.status === "ready"
          ? { status: "ready", summary: data.summary }
          : { status: data.status },
      );
    },

    async saveMerchantProfile(input) {
      const { error } = await client.rpc("save_merchant_profile", {
        p_merchant_key: merchantKey(input.merchantName),
        ...(input.summary === null ? {} : { p_summary: input.summary }),
      });
      if (error) fail(error);
    },

    async releaseMerchantProfile(merchantName) {
      const { error } = await client.rpc("release_merchant_profile", {
        p_merchant_key: merchantKey(merchantName),
      });
      if (error) fail(error);
    },

    async setImportedCategory(input) {
      const { data, error } = await client
        .rpc("set_imported_category", {
          p_transaction_id: input.transactionId,
          p_category_name: input.categoryName,
        })
        .single();
      if (error) fail(error);
      return {
        applied: data.applied,
        userId: data.user_id,
        confirmed: data.review_status === "confirmed",
      };
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

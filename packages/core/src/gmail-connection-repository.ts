// Supabase-backed GmailConnectionRepository. The Gmail tables are service-role
// only, so RLS does not protect them: every query filters by the verified User.
import { type GmailSyncStatus, gmailConnectionSchema, type UserId } from "@monara/contracts";
import type { Database, MonaraServiceRoleClient } from "@monara/db";
import {
  GmailConnectionError,
  type GmailConnectionRepository,
  type StoredGmailConnection,
} from "./gmail-connections.ts";
import { isNewFinding } from "./gmail-discovery.ts";

type Row = Database["public"]["Tables"]["gmail_connections"]["Row"];

const COLUMNS =
  "id, composio_connected_account_id, gmail_address, status, last_synced_at, created_at";

type SyncStatusRow = Database["public"]["Functions"]["gmail_sync_statuses"]["Returns"][number];

const IDLE_SYNC: GmailSyncStatus = {
  state: "idle",
  error: null,
  requestedAt: null,
  counts: {
    imported: 0,
    skipped: 0,
    failed: 0,
    inProgress: 0,
    importedTransactions: 0,
    confirmedTransactions: 0,
  },
};

function toSyncStatus(row: SyncStatusRow | undefined): GmailSyncStatus {
  if (!row) return IDLE_SYNC;
  return {
    state: row.state as GmailSyncStatus["state"],
    error: (row.error ?? null) as GmailSyncStatus["error"],
    requestedAt: row.requested_at ?? null,
    counts: {
      imported: row.imported,
      skipped: row.skipped,
      failed: row.failed,
      inProgress: row.in_progress,
      importedTransactions: row.imported_transactions,
      confirmedTransactions: row.confirmed_transactions,
    },
  };
}

function toStored(
  row: Pick<
    Row,
    | "id"
    | "composio_connected_account_id"
    | "gmail_address"
    | "status"
    | "last_synced_at"
    | "created_at"
  >,
  sync: GmailSyncStatus = IDLE_SYNC,
  newAccounts = 0,
): StoredGmailConnection {
  return {
    ...gmailConnectionSchema.parse({
      id: row.id,
      gmailAddress: row.gmail_address,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      createdAt: row.created_at,
      sync,
      newAccounts,
    }),
    composioConnectedAccountId: row.composio_connected_account_id,
  };
}

/** Postgres error codes are safe to inspect; messages and details are not returned. */
function fail(error: { code?: string; message?: string }): never {
  if (error.code === "23514" && error.message?.includes("at most three active Gmail")) {
    throw new GmailConnectionError("CONFLICT", "You can connect at most 3 Gmail accounts.");
  }
  if (error.code === "23505") {
    throw new GmailConnectionError("CONFLICT", "This Gmail account is already connected.");
  }
  throw new GmailConnectionError("INTERNAL", "Gmail connections could not be saved.");
}

export function createSupabaseGmailConnectionRepository(
  client: MonaraServiceRoleClient,
): GmailConnectionRepository {
  return {
    async listForUser(userId: UserId) {
      const [connections, statuses, findings, accounts] = await Promise.all([
        client
          .from("gmail_connections")
          .select(`${COLUMNS}, discovery_first_completed_at`)
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        client.rpc("gmail_sync_statuses", { p_user_id: userId }),
        client
          .from("gmail_institution_discoveries")
          .select("gmail_connection_id, institution_key, first_seen_at, dismissed_at")
          .eq("user_id", userId)
          .is("dismissed_at", null),
        client
          .from("financial_accounts")
          .select("institution_key")
          .eq("user_id", userId)
          .eq("is_active", true)
          .not("institution_key", "is", null),
      ]);
      if (connections.error) fail(connections.error);
      if (statuses.error) fail(statuses.error);
      if (findings.error) fail(findings.error);
      if (accounts.error) fail(accounts.error);
      const byConnection = new Map(statuses.data.map((row) => [row.connection_id, row]));
      const linkedKeys = new Set(accounts.data.map((account) => account.institution_key ?? ""));
      return connections.data.map((row) => {
        const newAccounts = findings.data.filter(
          (finding) =>
            finding.gmail_connection_id === row.id &&
            isNewFinding(
              {
                institutionKey: finding.institution_key,
                firstSeenAt: finding.first_seen_at,
                dismissedAt: finding.dismissed_at,
              },
              row.discovery_first_completed_at,
              linkedKeys,
            ),
        ).length;
        return toStored(row, toSyncStatus(byConnection.get(row.id)), newAccounts);
      });
    },

    async activate({ userId, gmailAddress, composioConnectedAccountId }) {
      const existing = await client
        .from("gmail_connections")
        .select("id, composio_connected_account_id")
        .eq("user_id", userId)
        .eq("gmail_address", gmailAddress)
        .maybeSingle();
      if (existing.error) fail(existing.error);

      const values = {
        composio_connected_account_id: composioConnectedAccountId,
        status: "active",
      };
      const saved = existing.data
        ? await client
            .from("gmail_connections")
            .update(values)
            .eq("id", existing.data.id)
            .eq("user_id", userId)
            .select(COLUMNS)
            .single()
        : await client
            .from("gmail_connections")
            .insert({ ...values, user_id: userId, gmail_address: gmailAddress })
            .select(COLUMNS)
            .single();
      if (saved.error) fail(saved.error);

      const previous = existing.data?.composio_connected_account_id ?? null;
      return {
        connection: toStored(saved.data),
        replacedComposioAccountId: previous !== composioConnectedAccountId ? previous : null,
      };
    },

    async markDisconnected({ userId, connectionId }) {
      const { error } = await client
        .from("gmail_connections")
        .update({ status: "disconnected" })
        .eq("id", connectionId)
        .eq("user_id", userId);
      if (error) fail(error);
    },
  };
}

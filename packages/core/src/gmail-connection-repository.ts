// Supabase-backed GmailConnectionRepository. The Gmail tables are service-role
// only, so RLS does not protect them: every query filters by the verified User.
import { gmailConnectionSchema, type UserId } from "@monara/contracts";
import type { Database, MonaraServiceRoleClient } from "@monara/db";
import {
  GmailConnectionError,
  type GmailConnectionRepository,
  type StoredGmailConnection,
} from "./gmail-connections.ts";

type Row = Database["public"]["Tables"]["gmail_connections"]["Row"];

const COLUMNS =
  "id, composio_connected_account_id, gmail_address, status, last_synced_at, created_at";

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
): StoredGmailConnection {
  return {
    ...gmailConnectionSchema.parse({
      id: row.id,
      gmailAddress: row.gmail_address,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      createdAt: row.created_at,
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
      const { data, error } = await client
        .from("gmail_connections")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) fail(error);
      return data.map(toStored);
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

import type { MonaraServiceRoleClient } from "@monara/db";
import { createSupabaseGoalImageUploadRepository } from "./supabase-goal-image-upload-repository.ts";
import type { UserDeletionRepository } from "./user-deletion.ts";

function fail(): never {
  throw new Error("Account cleanup is temporarily unavailable.");
}

export function createSupabaseUserDeletionRepository(
  client: MonaraServiceRoleClient,
): UserDeletionRepository {
  return {
    async claim(userId) {
      const result = await client.rpc("claim_user_deletion", { p_user_id: userId });
      if (result.error) fail();
      const row = result.data[0];
      if (!row?.lease_token) return null;
      return {
        userId: row.user_id,
        leaseToken: row.lease_token,
        connectedAccountIds: row.connected_account_ids,
        triggerIds: row.trigger_ids,
        whatsappPurged: row.whatsapp_purged,
      };
    },
    async checkpoint(job, retry) {
      const result = await client
        .from("user_deletions")
        .update({
          connected_account_ids: job.connectedAccountIds,
          trigger_ids: job.triggerIds,
          whatsapp_purged: job.whatsappPurged,
          lease_token: null,
          lease_until: null,
          next_attempt_at: new Date(Date.now() + (retry ? 60_000 : 0)).toISOString(),
        })
        .eq("user_id", job.userId)
        .eq("lease_token", job.leaseToken)
        .gt("lease_until", new Date().toISOString())
        .select("user_id");
      if (result.error || result.data.length !== 1) fail();
    },
    async deleteIdentity(job) {
      const lease = await client
        .from("user_deletions")
        .select("user_id, connected_account_ids, trigger_ids")
        .eq("user_id", job.userId)
        .eq("lease_token", job.leaseToken)
        .eq("whatsapp_purged", true)
        .gt("lease_until", new Date().toISOString())
        .maybeSingle();
      if (
        lease.error ||
        !lease.data ||
        lease.data.connected_account_ids.length > 0 ||
        lease.data.trigger_ids.length > 0
      )
        fail();
      // An inactive identity cannot begin another upload. Check immediately before
      // the hard delete so a late, previously authorized Storage call stays owned.
      if (
        (await createSupabaseGoalImageUploadRepository(client).listPending(job.userId)).length > 0
      )
        fail();
      const prepared = await client.rpc("prepare_goal_image_identity_deletion", {
        p_user_id: job.userId,
        p_lease_token: job.leaseToken,
      });
      if (prepared.error) fail();
      // Never soft delete: a later Google sign-in must create a new User.
      const result = await client.auth.admin.deleteUser(job.userId, false);
      if (result.error) fail();
    },
  };
}

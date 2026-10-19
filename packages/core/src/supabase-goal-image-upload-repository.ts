import type { MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError } from "./finance.ts";

interface GoalImageUploadIdentity {
  uploadId: string;
  userId: string;
  goalId: string;
  objectPath: string;
  expectedUpdatedAt: string;
}

export interface GoalImageUploadRepository {
  begin(input: GoalImageUploadIdentity): Promise<void>;
  /** Only before a Storage request was attempted; closes a late registration. */
  cancelUnstarted(input: GoalImageUploadIdentity): Promise<void>;
  settle(input: { uploadId: string; userId: string }): Promise<void>;
  listPending(userId: string): Promise<{ uploadId: string; objectPath: string }[]>;
}

function fail(error: { code?: string }): never {
  if (error.code === "P0002" || error.code === "42501")
    throw new FinanceOperationError("NOT_FOUND", "That Goal was not found.");
  if (error.code === "55000" || error.code === "40001" || error.code === "23505")
    throw new FinanceOperationError("CONFLICT", "That Goal changed. Reload it and try again.");
  if (error.code === "23514")
    throw new FinanceOperationError("UNAUTHENTICATED", "This account is no longer available.");
  throw new FinanceOperationError(
    "DEPENDENCY_UNAVAILABLE",
    "The image upload couldn’t be confirmed. Your goal is unchanged. Try again later.",
  );
}

/** Private upload outcomes survive product-data erasure until Storage is reconciled. */
export function createSupabaseGoalImageUploadRepository(
  client: MonaraServiceRoleClient,
): GoalImageUploadRepository {
  return {
    async begin(input) {
      const result = await client.rpc("begin_goal_image_upload", {
        p_upload_id: input.uploadId,
        p_user_id: input.userId,
        p_goal_id: input.goalId,
        p_object_path: input.objectPath,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (result.error) fail(result.error);
    },
    async cancelUnstarted(input) {
      const result = await client.rpc("cancel_unstarted_goal_image_upload", {
        p_upload_id: input.uploadId,
        p_user_id: input.userId,
        p_goal_id: input.goalId,
        p_object_path: input.objectPath,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (result.error) fail(result.error);
    },
    async settle(input) {
      const result = await client.rpc("settle_goal_image_upload", {
        p_upload_id: input.uploadId,
        p_user_id: input.userId,
      });
      if (result.error) fail(result.error);
    },
    async listPending(userId) {
      const result = await client.rpc("list_pending_goal_image_uploads", { p_user_id: userId });
      if (result.error) fail(result.error);
      return result.data.map((row) => ({ uploadId: row.upload_id, objectPath: row.object_path }));
    },
  };
}

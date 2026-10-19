import assert from "node:assert/strict";
import { it } from "node:test";
import { createMonaraServiceRoleClient } from "@monara/db";
import { createSupabaseGoalImageUploadRepository } from "./supabase-goal-image-upload-repository.ts";

const identity = {
  uploadId: "d1900000-0000-4000-8000-000000000031",
  userId: "d1900000-0000-4000-8000-000000000001",
  goalId: "d1900000-0000-4000-8000-000000000021",
  objectPath:
    "d1900000-0000-4000-8000-000000000001/d1900000-0000-4000-8000-000000000021/d1900000-0000-4000-8000-000000000041.png",
  expectedUpdatedAt: "2026-10-19T00:00:00Z",
};

it("keeps upload registration, unstarted cancellation and completion owner-scoped at the repository boundary", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(input).pathname;
    calls.push({ path, body: JSON.parse(init.body) });
    return Response.json(
      path.endsWith("list_pending_goal_image_uploads")
        ? [{ upload_id: identity.uploadId, object_path: identity.objectPath }]
        : path.endsWith("settle_expired_goal_image_upload")
          ? true
          : null,
    );
  };
  try {
    const client = createMonaraServiceRoleClient(
      { url: "https://db.test", publishableKey: "synthetic" },
      "synthetic-service-only",
    );
    const repository = createSupabaseGoalImageUploadRepository(client);
    await repository.begin(identity);
    await repository.cancelUnstarted(identity);
    await repository.settle(identity);
    assert.equal(await repository.settleExpiredAbsent(identity), true);
    assert.deepEqual(await repository.listPending(identity.userId), [
      { uploadId: identity.uploadId, objectPath: identity.objectPath },
    ]);
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "begin_goal_image_upload",
        "cancel_unstarted_goal_image_upload",
        "settle_goal_image_upload",
        "settle_expired_goal_image_upload",
        "list_pending_goal_image_uploads",
      ].map((name) => `/rest/v1/rpc/${name}`),
    );
    assert.deepEqual(calls[0].body, {
      p_upload_id: identity.uploadId,
      p_user_id: identity.userId,
      p_goal_id: identity.goalId,
      p_object_path: identity.objectPath,
      p_expected_updated_at: identity.expectedUpdatedAt,
    });
    assert.deepEqual(calls[1].body, calls[0].body);
    assert.deepEqual(calls[2].body, { p_upload_id: identity.uploadId, p_user_id: identity.userId });
    assert.deepEqual(calls[3].body, { p_upload_id: identity.uploadId, p_user_id: identity.userId });
    assert.deepEqual(calls[4].body, { p_user_id: identity.userId });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("maps real upload RPC errors into explicit missing-goal, stale-goal, identity and retry outcomes", async () => {
  const originalFetch = globalThis.fetch;
  let code;
  globalThis.fetch = async () =>
    Response.json({ code, message: "Synthetic failure" }, { status: 409 });
  try {
    const client = createMonaraServiceRoleClient(
      { url: "https://db.test", publishableKey: "synthetic" },
      "synthetic-service-only",
    );
    const repository = createSupabaseGoalImageUploadRepository(client);
    for (const [databaseCode, productCode] of [
      ["42501", "NOT_FOUND"],
      ["40001", "CONFLICT"],
      ["23505", "CONFLICT"],
      ["23514", "UNAUTHENTICATED"],
      ["XX000", "DEPENDENCY_UNAVAILABLE"],
    ]) {
      code = databaseCode;
      await assert.rejects(
        () => repository.begin(identity),
        (error) => error.code === productCode,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

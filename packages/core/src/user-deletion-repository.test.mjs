import assert from "node:assert/strict";
import { it } from "node:test";
import { createMonaraServiceRoleClient } from "@monara/db";
import { createSupabaseUserDeletionRepository } from "./supabase-user-deletion-repository.ts";

it("the final Auth delete requires a current lease and empty cleanup targets", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const userId = "d1900000-0000-4000-8000-000000000001";
  let targets = ["pending-provider"];
  let leased = true;
  let pendingUpload = false;
  let preparationFails = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    calls.push({
      path: url.pathname,
      query: url.searchParams,
      method: init?.method,
      body: init?.body,
    });
    if (url.pathname.includes("/rest/v1/user_deletions")) {
      return Response.json(
        leased ? [{ user_id: userId, connected_account_ids: targets, trigger_ids: [] }] : [],
      );
    }
    if (url.pathname.endsWith("/rpc/list_pending_goal_image_uploads"))
      return Response.json(
        pendingUpload ? [{ upload_id: "upload", object_path: `${userId}/goal/opaque.png` }] : [],
      );
    if (url.pathname.endsWith("/rpc/prepare_goal_image_identity_deletion"))
      return preparationFails
        ? Response.json({ code: "55000", message: "Synthetic lease expired" }, { status: 409 })
        : Response.json(null);
    return Response.json({ id: userId });
  };
  try {
    const client = createMonaraServiceRoleClient(
      { url: "https://db.test", publishableKey: "synthetic-only" },
      "synthetic-service-key",
    );
    const repository = createSupabaseUserDeletionRepository(client);
    const job = {
      userId,
      leaseToken: "lease",
      connectedAccountIds: [],
      triggerIds: [],
      whatsappPurged: true,
    };
    await assert.rejects(() => repository.deleteIdentity(job));
    assert.equal(calls.length, 1, "a pending provider target prevents the Auth request");
    targets = [];
    leased = false;
    await assert.rejects(() => repository.deleteIdentity(job));
    assert.equal(calls.length, 2, "a lost lease prevents the Auth request");
    leased = true;
    pendingUpload = true;
    await assert.rejects(() => repository.deleteIdentity(job));
    assert.ok(
      !calls.some((call) => call.path.includes("/auth/v1/admin/users/")),
      "an unresolved upload blocks Auth erasure",
    );
    pendingUpload = false;
    preparationFails = true;
    await assert.rejects(() => repository.deleteIdentity(job));
    assert.ok(
      !calls.some((call) => call.path.includes("/auth/v1/admin/users/")),
      "a failed final lease or upload fence prevents Auth erasure",
    );
    preparationFails = false;
    await repository.deleteIdentity(job);
    const deletion = calls.at(-1);
    assert.equal(deletion.method, "DELETE");
    assert.equal(deletion.path, `/auth/v1/admin/users/${userId}`);
    assert.equal(JSON.parse(deletion.body).should_soft_delete, false);
    assert.deepEqual(JSON.parse(calls.at(-2).body), { p_user_id: userId, p_lease_token: "lease" });
    assert.equal(calls[0].query.get("user_id"), `eq.${userId}`);
    assert.equal(calls[0].query.get("lease_token"), "eq.lease");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

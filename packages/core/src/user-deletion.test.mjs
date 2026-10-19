import assert from "node:assert/strict";
import { it } from "node:test";
import { createUserDeletionService } from "./user-deletion.ts";

function harness() {
  let stored = {
    userId: "user-one",
    leaseToken: "lease",
    whatsappPurged: false,
    triggerIds: ["trigger"],
    connectedAccountIds: ["old-disconnected", "active"],
  };
  const calls = [];
  let unavailable = null;
  const deps = {
    cleanProviderUser: async () => true,
    repository: {
      claim: async () => (stored ? structuredClone(stored) : null),
      checkpoint: async (job, retry) => {
        stored = structuredClone(job);
        calls.push(retry ? "retry" : "checkpoint");
      },
      deleteIdentity: async () => {
        calls.push("auth-delete");
        stored = null;
      },
    },
    purgeWhatsApp: async () => {
      calls.push("whatsapp");
      if (unavailable === "whatsapp") throw new Error("Unavailable");
    },
    removeTrigger: async (id) => {
      calls.push(id);
      if (unavailable === "trigger") throw new Error("Unavailable");
    },
    revokeConnection: async (id) => {
      calls.push(id);
      if (unavailable === id) throw new Error("Unavailable");
    },
  };
  return {
    service: createUserDeletionService(deps),
    calls,
    fail: (value) => {
      unavailable = value;
    },
    stored: () => stored,
  };
}

it("hard-deletes Auth only after every cleanup step, including disconnected Gmail", async () => {
  const h = harness();
  for (let step = 0; step < 4; step++) {
    assert.equal(await h.service.processNext(), "progress");
    assert.ok(!h.calls.includes("auth-delete"));
  }
  assert.equal(await h.service.processNext(), "complete");
  assert.equal(await h.service.processNext(), "idle");
  assert.deepEqual(
    h.calls.filter((value) => value !== "checkpoint"),
    ["whatsapp", "trigger", "old-disconnected", "active", "auth-delete"],
  );
});

it("a provider failure retains its cleanup target and blocks completion until retry succeeds", async () => {
  const h = harness();
  await h.service.processNext();
  h.fail("trigger");
  assert.equal(await h.service.processNext(), "retry");
  assert.deepEqual(h.stored().triggerIds, ["trigger"]);
  assert.ok(!h.calls.includes("auth-delete"));
  h.fail(null);
  assert.equal(await h.service.processNext(), "progress");
  assert.deepEqual(h.stored().triggerIds, []);
  assert.equal(h.calls.filter((value) => value === "whatsapp").length, 1);
});

it("an unavailable conversation store is never treated as purged", async () => {
  const h = harness();
  h.fail("whatsapp");
  assert.equal(await h.service.processNext(), "retry");
  assert.equal(h.stored().whatsappPurged, false);
  assert.deepEqual(h.calls, ["whatsapp", "retry"]);
});

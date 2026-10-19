import assert from "node:assert/strict";
import { test } from "node:test";
import type { Env } from "../src/env.ts";
import { handleUserPurge, processUserDeletions } from "../src/user-deletion.ts";

test("only the backend may purge an inactive User; an unverified status fails closed", async () => {
  const originalFetch = globalThis.fetch;
  let purges = 0;
  let active = true;
  let unavailable = false;
  const env: Env = {
    MONARA_BACKEND_URL: "https://backend.test",
    MONARA_AGENT_BACKEND_SECRET: "synthetic-only",
    CONVERSATIONS: {
      idFromName: () => "object",
      get: () => ({
        purge: async () => {
          purges++;
        },
      }),
    } as unknown as Env["CONVERSATIONS"],
  };
  globalThis.fetch = async () => {
    if (unavailable) throw new Error("Unavailable");
    return Response.json({ active });
  };
  const request = (secret = "synthetic-only", userId = "d1900000-0000-4000-8000-000000000001") =>
    new Request("https://agent.test/users/purge", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  try {
    assert.equal((await handleUserPurge(request("wrong-secret"), env)).status, 401);
    assert.equal((await handleUserPurge(request(), env)).status, 409);
    assert.equal(purges, 0);
    active = false;
    unavailable = true;
    assert.equal((await handleUserPurge(request(), env)).status, 503);
    assert.equal(purges, 0);
    unavailable = false;
    assert.equal((await handleUserPurge(request(), env)).status, 204);
    assert.equal(purges, 1);
    assert.equal((await handleUserPurge(request("synthetic-only", "bad-id"), env)).status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the scheduled wake-up uses the authenticated backend deletion processor", async () => {
  const originalFetch = globalThis.fetch;
  let endpoint = "";
  globalThis.fetch = async (input, init) => {
    endpoint = String(input);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-only");
    return Response.json({ steps: 0 });
  };
  try {
    await processUserDeletions({
      MONARA_BACKEND_URL: "https://backend.test",
      MONARA_AGENT_BACKEND_SECRET: "synthetic-only",
    });
    assert.equal(endpoint, "https://backend.test/api/agent/account-deletions/process");
    await assert.rejects(() => processUserDeletions({}));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

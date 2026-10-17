import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { dispatchReminders } from "../src/reminders.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the cron asks the backend to dispatch held reminders with the shared secret", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get("Authorization"),
    });
    return Response.json({ settled: 2 });
  };
  await dispatchReminders({
    MONARA_BACKEND_URL: "https://monara.test/",
    MONARA_AGENT_BACKEND_SECRET: "backend-secret",
  });
  assert.deepEqual(calls, [
    { url: "https://monara.test/api/agent/reminders/dispatch", auth: "Bearer backend-secret" },
  ]);
});

test("the cron sends nothing without the backend settings and never throws on failure", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("network down");
  };
  await dispatchReminders({ MONARA_BACKEND_URL: "https://monara.test" });
  assert.equal(called, false);
  await dispatchReminders({
    MONARA_BACKEND_URL: "https://monara.test",
    MONARA_AGENT_BACKEND_SECRET: "backend-secret",
  });
  assert.equal(called, true);
});

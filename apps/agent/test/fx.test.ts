import assert from "node:assert/strict";
import { test } from "node:test";
import type { Env } from "../src/env.ts";
import { recoverCurrencyConversions } from "../src/fx.ts";

test("currency recovery wakes only the authenticated backend and carries no financial records", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://backend.example.test/api/agent/fx/recover");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-secret");
    assert.equal(init?.body, undefined);
    assert.ok(init?.signal);
    return Response.json({ attempted: 1, confirmed: 1 });
  };
  try {
    await recoverCurrencyConversions({
      MONARA_BACKEND_URL: "https://backend.example.test/",
      MONARA_AGENT_BACKEND_SECRET: "synthetic-secret",
    } as Env);
    assert.equal(calls, 1);
    await recoverCurrencyConversions({} as Env);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("a failed currency wake-up leaves durable recovery to the next schedule", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    await assert.rejects(
      recoverCurrencyConversions({
        MONARA_BACKEND_URL: "https://backend.example.test",
        MONARA_AGENT_BACKEND_SECRET: "synthetic-secret",
      } as Env),
      /Currency recovery wake-up failed/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

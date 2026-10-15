import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GmailJob } from "@monara/contracts";
import type { Env } from "../src/env.ts";
import { handleGmailSyncRequest } from "../src/gmail/worker.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const secret = "synthetic-test-secret";

function setup() {
  const jobs: GmailJob[] = [];
  const queue = {
    async send(job: GmailJob) {
      jobs.push(job);
    },
  } as unknown as Queue<GmailJob>;
  const env: Env = { GMAIL_JOBS: queue, MONARA_AGENT_BACKEND_SECRET: secret };
  const request = (body: unknown, authorization = `Bearer ${secret}`) =>
    new Request("https://agent.example/gmail/sync", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { env, jobs, request };
}

describe("manual Gmail sync worker boundary", () => {
  it("preserves the backend-provided cursor in the queued job", async () => {
    const { env, jobs, request } = setup();
    const since = "2026-10-14T04:00:00Z";
    const response = await handleGmailSyncRequest(request({ connectionId, since }), env);

    assert.equal(response.status, 202);
    assert.deepEqual(jobs, [
      { kind: "gmail.sync", connectionId, since, pageToken: null, startedAt: null },
    ]);
  });

  it("rejects missing cursors and caller-supplied identity before queueing", async () => {
    for (const body of [
      { connectionId },
      { connectionId, since: null, userId: "00000000-0000-4000-8000-000000000001" },
    ]) {
      const { env, jobs, request } = setup();
      const response = await handleGmailSyncRequest(request(body), env);
      assert.equal(response.status, 400);
      assert.deepEqual(jobs, []);
    }
  });

  it("rejects invalid backend credentials before queueing", async () => {
    const { env, jobs, request } = setup();
    const response = await handleGmailSyncRequest(
      request({ connectionId, since: null }, "Bearer wrong-secret"),
      env,
    );

    assert.equal(response.status, 401);
    assert.deepEqual(jobs, []);
  });

  it("falls back to a bounded direct import when the free queue daily limit is exhausted", async (t) => {
    const queue = {
      async send() {
        throw new Error("You have exceeded the daily write operations limit in Queues free tier");
      },
    } as unknown as Queue<GmailJob>;
    const env: Env = {
      GMAIL_JOBS: queue,
      MONARA_AGENT_BACKEND_SECRET: secret,
      MONARA_BACKEND_URL: "https://web.example",
      COMPOSIO_API_URL: "https://composio.example/api/v3.1",
      COMPOSIO_API_KEY: "composio-key",
      LLM_BASE_URL: "https://llm.example/openai/v1",
      LLM_API_KEY: "model-key",
      LLM_MODEL: "model",
    };
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/agent/gmail/resolve-connection")) {
        return Response.json({
          connectionId,
          userId: "00000000-0000-4000-8000-000000000001",
          composioConnectedAccountId: "ca_1",
          categoryNames: [],
        });
      }
      if (url.endsWith("/tools/execute/GMAIL_FETCH_EMAILS")) {
        return Response.json({ successful: true, data: { messages: [] } });
      }
      return new Response(null, { status: 404 });
    });
    let background: Promise<unknown> | null = null;
    const context = {
      waitUntil(promise: Promise<unknown>) {
        background = promise;
      },
    };
    const request = new Request("https://agent.example/gmail/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, since: null }),
    });

    const response = await handleGmailSyncRequest(request, env, context);

    assert.equal(response.status, 202);
    assert.ok(background);
    await background;
  });
});

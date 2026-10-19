import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GmailJob, MerchantCategorizeJob } from "@monara/contracts";
import type { Env } from "../src/env.ts";
import {
  consumeGmailJobs,
  consumeMerchantJobs,
  handleGmailIngestRequest,
  handleGmailSyncRequest,
} from "../src/gmail/worker.ts";

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
  it("splits older large parse batches before provider work without dropping email identifiers", async () => {
    const jobs: GmailJob[] = [];
    let acked = false;
    const emails = Array.from({ length: 8 }, (_, index) => ({
      processedMessageId: `d1900000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      gmailMessageId: `synthetic-${index}`,
      receivedAt: "2026-10-19T00:00:00Z",
    }));
    const env: Env = {
      GMAIL_JOBS: {
        sendBatch: async (batch: { body: GmailJob }[]) => {
          jobs.push(...batch.map((entry) => entry.body));
        },
      } as unknown as Queue<GmailJob>,
      MERCHANT_JOBS: {} as Queue<MerchantCategorizeJob>,
      MONARA_AGENT_BACKEND_SECRET: secret,
      MONARA_BACKEND_URL: "https://backend.test",
      COMPOSIO_API_URL: "https://provider.test/api/v3.1",
      COMPOSIO_API_KEY: "synthetic-only",
      LLM_API_KEY: "synthetic-only",
      LLM_BASE_URL: "https://model.test",
      LLM_MODEL: "synthetic-model",
    };
    await consumeGmailJobs(
      {
        messages: [
          {
            body: { kind: "gmail.parse", connectionId, emails, deferrals: 0 },
            attempts: 1,
            ack: () => {
              acked = true;
            },
          },
        ],
      } as unknown as MessageBatch<unknown>,
      env,
    );
    assert.equal(acked, true);
    assert.deepEqual(
      jobs.map((job) => (job.kind === "gmail.parse" ? job.emails.length : 0)),
      [5, 3],
    );
    assert.deepEqual(
      jobs.flatMap((job) => (job.kind === "gmail.parse" ? job.emails : [])),
      emails,
    );
  });
  it("preserves the backend-provided cursor in the queued job", async () => {
    const { env, jobs, request } = setup();
    const since = "2026-10-14T04:00:00Z";
    const response = await handleGmailSyncRequest(request({ connectionId, since }), env);

    assert.equal(response.status, 202);
    assert.deepEqual(jobs, [
      {
        kind: "gmail.sync",
        connectionId,
        since,
        pageToken: null,
        startedAt: null,
        institutionKeys: null,
        messageIds: null,
        tracksSync: true,
      },
    ]);
  });

  it("queues a scoped ingest for one newly linked account", async () => {
    const { env, jobs, request } = setup();
    const response = await handleGmailIngestRequest(
      request({
        connectionId,
        reason: "account_added",
        institutionKeys: ["BCA_CC"],
        tracksSync: false,
      }),
      env,
    );
    assert.equal(response.status, 202);
    assert.deepEqual(jobs, [
      {
        kind: "gmail.sync",
        connectionId,
        since: null,
        pageToken: null,
        startedAt: null,
        institutionKeys: ["BCA_CC"],
        messageIds: null,
        tracksSync: false,
      },
    ]);
  });

  it("rejects an ingest with an unknown reason or caller-supplied identity", async () => {
    for (const body of [
      { connectionId, reason: "because" },
      { connectionId, reason: "onboarding", userId: "00000000-0000-4000-8000-000000000001" },
    ]) {
      const { env, jobs, request } = setup();
      const response = await handleGmailIngestRequest(request(body), env);
      assert.equal(response.status, 400);
      assert.deepEqual(jobs, []);
    }
    const { env, jobs, request } = setup();
    const response = await handleGmailIngestRequest(
      request({ connectionId, reason: "onboarding" }, "Bearer wrong-secret"),
      env,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(jobs, []);
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
      MERCHANT_JOBS: {} as Queue<MerchantCategorizeJob>,
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
          institutionKeys: ["BCA_CC"],
        });
      }
      if (url.endsWith("/api/agent/gmail/check-connection-active")) return Response.json({});
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

describe("merchant queue provider backoff", () => {
  for (const fixture of [
    {
      name: "honors Brave Retry-After and persists its deadline",
      deadlineStatus: 200,
      busy: false,
      delay: 125,
    },
    {
      name: "keeps the provider retry when deadline reporting fails",
      deadlineStatus: 503,
      busy: false,
      delay: 125,
    },
    {
      name: "persists a busy merchant profile wait without searching",
      deadlineStatus: 200,
      busy: true,
      delay: 15,
    },
  ]) {
    it(fixture.name, async (t) => {
      let retrySeconds = 0;
      let searches = 0;
      const reports: unknown[] = [];
      const transactionIds = [
        "00000000-0000-4000-8000-000000000030",
        "00000000-0000-4000-8000-000000000031",
      ];
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith("/resolve-imported-transaction"))
            return Response.json({
              merchantName: "Synthetic Cafe",
              location: null,
              needsCategory: true,
              categoryNames: [],
              kind: "expense",
              flowDirection: "out",
              counterpartyName: "Synthetic Cafe",
              counterpartyType: "business",
              categories: [
                {
                  id: "00000000-0000-4000-8000-000000000040",
                  name: "Food",
                  kind: "expense",
                  slug: "food",
                  isDefault: true,
                },
              ],
            });
          if (url.endsWith("/claim-merchant-profile"))
            return Response.json({ status: fixture.busy ? "busy" : "claimed" });
          if (url.endsWith("/release-merchant-profile")) return Response.json({});
          if (url.endsWith("/report-processing-retry")) {
            reports.push(JSON.parse(String(init?.body)));
            return Response.json({}, { status: fixture.deadlineStatus });
          }
          if (url.startsWith("https://api.search.brave.com/")) {
            searches += 1;
            return new Response(null, { status: 429, headers: { "Retry-After": "125" } });
          }
          throw new Error("Unexpected synthetic request");
        },
      );
      await consumeMerchantJobs(
        {
          messages: [
            {
              body: { kind: "merchant.categorize", transactionIds },
              attempts: 1,
              ack() {
                assert.fail("transient work must retry");
              },
              retry(options: { delaySeconds: number }) {
                retrySeconds = options.delaySeconds;
              },
            },
          ],
        } as unknown as MessageBatch<unknown>,
        {
          MONARA_BACKEND_URL: "https://backend.test",
          MONARA_AGENT_BACKEND_SECRET: "synthetic",
          LLM_BASE_URL: "https://llm.test",
          LLM_API_KEY: "synthetic",
          LLM_MODEL: "synthetic",
          BRAVE_SEARCH_API_KEY: "synthetic",
        },
      );
      assert.equal(searches, fixture.busy ? 0 : 1);
      assert.equal(retrySeconds, fixture.delay);
      assert.deepEqual(
        reports,
        transactionIds.map((transactionId) => ({ transactionId, delaySeconds: fixture.delay })),
      );
    });
  }
});

describe("Gmail queue retry deadline", () => {
  for (const deadlineStatus of [200, 503]) {
    it(`preserves the ordinary queue retry when deadline HTTP status is ${deadlineStatus}`, async (t) => {
      let retrySeconds = 0;
      const reports: unknown[] = [];
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          if (String(input).endsWith("/resolve-connection"))
            return Response.json({}, { status: 503 });
          if (String(input).endsWith("/report-processing-retry")) {
            reports.push(JSON.parse(String(init?.body)));
            return Response.json({}, { status: deadlineStatus });
          }
          throw new Error("Unexpected synthetic request");
        },
      );
      await consumeGmailJobs(
        {
          messages: [
            {
              body: {
                kind: "gmail.parse",
                connectionId,
                deferrals: 0,
                emails: [
                  {
                    processedMessageId: "00000000-0000-4000-8000-000000000020",
                    gmailMessageId: "synthetic",
                    receivedAt: "2026-10-19T00:00:00Z",
                  },
                ],
              },
              attempts: 2,
              ack() {
                assert.fail("unavailable work must retry");
              },
              retry(options: { delaySeconds: number }) {
                retrySeconds = options.delaySeconds;
              },
            },
          ],
        } as unknown as MessageBatch<unknown>,
        {
          GMAIL_JOBS: {} as Queue<GmailJob>,
          MERCHANT_JOBS: {} as Queue<MerchantCategorizeJob>,
          MONARA_BACKEND_URL: "https://backend.test",
          MONARA_AGENT_BACKEND_SECRET: "synthetic",
          COMPOSIO_API_URL: "https://composio.test/api/v3.1",
          COMPOSIO_API_KEY: "synthetic",
          LLM_BASE_URL: "https://llm.test",
          LLM_API_KEY: "synthetic",
          LLM_MODEL: "synthetic",
        },
      );
      assert.equal(retrySeconds, 60);
      assert.deepEqual(reports, [{ connectionId, delaySeconds: 60 }]);
    });
  }
});

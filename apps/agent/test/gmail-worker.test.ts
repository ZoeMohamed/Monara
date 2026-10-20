import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { brands, type GmailJob, type MerchantCategorizeJob } from "@monara/contracts";
import type { Env } from "../src/env.ts";
import {
  consumeGmailJobs,
  consumeMerchantJobs,
  handleGmailIngestRequest,
  handleGmailSyncRequest,
} from "../src/gmail/worker.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const secret = "synthetic-test-secret";
const reasoningCases = [
  { label: "unset effort", value: undefined, expected: "medium", model: "synthetic" },
  { label: "explicit trimmed effort", value: " low ", expected: "low", model: "synthetic" },
  { label: "empty effort", value: "", expected: undefined, model: "gpt-4o-mini" },
  { label: "whitespace effort", value: "   ", expected: undefined, model: "gpt-4o-mini" },
] as const;

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
  for (const fixture of [
    ...reasoningCases.map((entry) => ({ ...entry, attempts: 1 })),
    { ...reasoningCases[0], attempts: 2 },
  ]) {
    const { attempts } = fixture;
    it(`publishes three maximal extraction emails within the invocation budget on attempt ${attempts} with ${fixture.label}`, async (t) => {
      const emails = Array.from({ length: 3 }, (_, index) => ({
        processedMessageId: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
        gmailMessageId: `synthetic-${index}`,
        receivedAt: "2026-10-19T00:00:00Z",
      }));
      const jobs: MerchantCategorizeJob[] = [];
      let networkRequests = 0;
      let recordCalls = 0;
      let queueCalls = 0;
      let acked = false;
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          networkRequests += 1;
          assert.ok(networkRequests + jobs.length <= 50);
          const url = String(input);
          if (url.endsWith("/resolve-connection"))
            return Response.json({
              connectionId,
              userId: "00000000-0000-4000-8000-000000000001",
              composioConnectedAccountId: "ca_1",
              categoryNames: [],
              institutionKeys: ["BCA_CC"],
            });
          if (url.endsWith("/check-connection-active")) return Response.json({});
          if (url.endsWith("/claim-messages"))
            return Response.json({
              pendingGmailMessageIds: emails.map((email) => email.gmailMessageId),
              pending: emails.map((email) => ({
                gmailMessageId: email.gmailMessageId,
                processedMessageId: email.processedMessageId,
              })),
              uncategorizedTransactionIds: [],
            });
          if (url.endsWith("/tools/execute/GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"))
            return Response.json({
              successful: true,
              data: {
                id: "synthetic",
                internalDate: "1792368000000",
                sender: "kartukreditbca@klikbca.com",
                subject: "Struk",
                messageText: "Total Rp 25.000 dibayar dengan BCA ****4242",
              },
            });
          if (url.endsWith("/chat/completions")) {
            const request = JSON.parse(String(init?.body));
            assert.equal(request.reasoning_effort, fixture.expected);
            assert.equal(
              Object.hasOwn(request, "reasoning_effort"),
              fixture.expected !== undefined,
            );
            assert.equal(request.max_tokens, 32_000);
            return Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      isTransactionEmail: true,
                      items: Array.from({ length: 20 }, () => ({
                        kind: "expense",
                        amountText: "Rp 25.000",
                        currency: "IDR",
                        occurredOn: "2026-10-12",
                        occurredTime: null,
                        merchantName: "Kopi Contoh",
                        description: null,
                        location: null,
                        accountHint: "BCA ****4242",
                        confidence: 0.8,
                      })),
                    }),
                  },
                },
              ],
            });
          }
          if (url.endsWith("/record-extractions")) {
            recordCalls += 1;
            const body = JSON.parse(String(init?.body));
            assert.equal(body.results.length, 1);
            assert.equal(body.results[0].items.length, 20);
            const ids = Array.from(
              { length: 20 },
              (_, index) =>
                `00000000-0000-4000-8000-${String(recordCalls * 100 + index).padStart(12, "0")}`,
            );
            return Response.json({
              results: [
                { transactionIds: ids, alreadyFinished: false, uncategorizedTransactionIds: ids },
              ],
            });
          }
          throw new Error("Unexpected synthetic request");
        },
      );
      await consumeGmailJobs(
        {
          messages: [
            {
              body: { kind: "gmail.parse", connectionId, emails, deferrals: 0 },
              attempts,
              ack() {
                acked = true;
              },
              retry() {
                assert.fail("bounded extraction should not retry");
              },
            },
          ],
        } as unknown as MessageBatch<unknown>,
        {
          GMAIL_JOBS: {} as Queue<GmailJob>,
          MERCHANT_JOBS: {
            async sendBatch(batch: { body: MerchantCategorizeJob }[]) {
              queueCalls += 1;
              jobs.push(...batch.map((entry) => entry.body));
              assert.ok(networkRequests + jobs.length <= 50);
            },
          } as unknown as Queue<MerchantCategorizeJob>,
          MONARA_AGENT_BACKEND_SECRET: secret,
          MONARA_BACKEND_URL: "https://backend.test",
          COMPOSIO_API_URL: "https://composio.example/api/v3.1",
          COMPOSIO_API_KEY: "synthetic",
          LLM_BASE_URL: "https://llm.test",
          LLM_API_KEY: "synthetic",
          LLM_MODEL: fixture.model,
          LLM_REASONING_EFFORT: fixture.value,
        },
      );
      assert.equal(acked, true);
      assert.equal(recordCalls, 3);
      assert.equal(queueCalls, 3);
      assert.equal(jobs.length, 21, "three 20-item receipts each enqueue seven bounded jobs");
      assert.equal(networkRequests, attempts === 1 ? 16 : 17);
      assert.ok(
        networkRequests + jobs.length <= 50,
        "budget also covers counting each queued message separately",
      );
    });
  }
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
      [3, 3, 2],
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
  for (const fixture of reasoningCases) {
    it(`settles a truncated model response on the first delivery with ${fixture.label}`, async (t) => {
      const transactionId = "00000000-0000-4000-8000-000000000030";
      let acked = false;
      let retries = 0;
      let categoryWrites = 0;
      let retryReports = 0;
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith("/resolve-imported-transaction"))
            return Response.json({
              merchantName: null,
              location: null,
              needsCategory: true,
              categoryNames: [],
              kind: "expense",
              flowDirection: "out",
              counterpartyName: "Synthetic Recipient",
              counterpartyType: "person",
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
          if (url.endsWith("/chat/completions")) {
            const request = JSON.parse(String(init?.body));
            assert.equal(request.reasoning_effort, fixture.expected);
            assert.equal(
              Object.hasOwn(request, "reasoning_effort"),
              fixture.expected !== undefined,
            );
            return Response.json({
              choices: [{ finish_reason: "length", message: { content: '{"categoryId":' } }],
            });
          }
          if (url.endsWith("/set-imported-category")) {
            const body = JSON.parse(String(init?.body));
            assert.deepEqual(body, {
              transactionId,
              categoryId: null,
              kind: null,
              confidence: null,
            });
            categoryWrites += 1;
            return Response.json({ applied: true });
          }
          if (url.endsWith("/report-processing-retry")) {
            retryReports += 1;
            return Response.json({});
          }
          throw new Error("Unexpected synthetic request");
        },
      );
      await consumeMerchantJobs(
        {
          messages: [
            {
              body: { kind: "merchant.categorize", transactionId },
              attempts: 1,
              ack() {
                acked = true;
              },
              retry() {
                retries += 1;
              },
            },
          ],
        } as unknown as MessageBatch<unknown>,
        {
          MONARA_BACKEND_URL: "https://backend.test",
          MONARA_AGENT_BACKEND_SECRET: "synthetic",
          LLM_BASE_URL: "https://llm.test",
          LLM_API_KEY: "synthetic",
          LLM_MODEL: fixture.model,
          LLM_REASONING_EFFORT: fixture.value,
          BRAVE_SEARCH_API_KEY: "synthetic",
        },
      );
      assert.equal(acked, true);
      assert.equal(retries, 0);
      assert.equal(categoryWrites, 1);
      assert.equal(retryReports, 0);
    });
  }

  it("retries when the final-attempt review write fails", async (t) => {
    const transactionId = "00000000-0000-4000-8000-000000000030";
    let acked = false;
    let retries = 0;
    let categoryWrites = 0;
    let retryReports = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/resolve-imported-transaction"))
          return Response.json({
            merchantName: null,
            location: null,
            needsCategory: true,
            categoryNames: [],
            kind: "expense",
            flowDirection: "out",
            counterpartyName: "Synthetic Recipient",
            counterpartyType: "person",
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
        if (url.endsWith("/chat/completions"))
          return Response.json({
            choices: [{ finish_reason: "length", message: { content: '{"categoryId":' } }],
          });
        if (url.endsWith("/set-imported-category")) {
          categoryWrites += 1;
          return new Response(null, { status: 503 });
        }
        if (url.endsWith("/report-processing-retry")) {
          retryReports += 1;
          const body = JSON.parse(String(init?.body));
          assert.deepEqual(body, { transactionId, delaySeconds: 600 });
          return Response.json({});
        }
        throw new Error("Unexpected synthetic request");
      },
    );
    await consumeMerchantJobs(
      {
        messages: [
          {
            body: { kind: "merchant.categorize", transactionId },
            attempts: 6,
            ack() {
              acked = true;
            },
            retry(options: { delaySeconds: number }) {
              retries += 1;
              assert.equal(options.delaySeconds, 600);
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
    assert.equal(acked, false);
    assert.equal(retries, 1);
    assert.equal(categoryWrites, 1);
    assert.equal(retryReports, 1);
  });

  it("continues provider backoff from attempts preserved by a split", async (t) => {
    let retrySeconds = 0;
    const reports: unknown[] = [];
    const transactionId = "00000000-0000-4000-8000-000000000030";
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/resolve-imported-transaction"))
          return Response.json({
            merchantName: "Synthetic Recipient",
            location: null,
            needsCategory: true,
            categoryNames: [],
            kind: "expense",
            flowDirection: "out",
            counterpartyName: "Synthetic Recipient",
            counterpartyType: "person",
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
        if (url.endsWith("/chat/completions")) return new Response(null, { status: 429 });
        if (url.endsWith("/report-processing-retry")) {
          reports.push(JSON.parse(String(init?.body)));
          return Response.json({});
        }
        throw new Error("Unexpected synthetic request");
      },
    );
    await consumeMerchantJobs(
      {
        messages: [
          {
            body: { kind: "merchant.categorize", transactionId, priorAttempts: 3 },
            attempts: 1,
            ack() {
              assert.fail("a logical fourth attempt still retries");
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
    assert.equal(retrySeconds, 240);
    assert.deepEqual(reports, [{ transactionId, delaySeconds: 240 }]);
  });
  it("preserves the last processing attempt across legacy fanout and oversized splitting", async (t) => {
    const legacyId = "00000000-0000-4000-8000-000000000030";
    const transactionIds = Array.from(
      { length: 8 },
      (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    );
    const pending: MerchantCategorizeJob[] = [];
    const terminalIds: string[] = [];
    let retries = 0;
    let modelCalls = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/resolve-imported-transaction"))
          return Response.json({
            merchantName: "Synthetic Recipient",
            location: null,
            needsCategory: true,
            categoryNames: [],
            kind: "expense",
            flowDirection: "out",
            counterpartyName: "Synthetic Recipient",
            counterpartyType: "person",
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
        if (url.endsWith("/chat/completions")) {
          modelCalls += 1;
          return new Response(null, { status: 429 });
        }
        if (url.endsWith("/set-imported-category")) {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.categoryId, null);
          terminalIds.push(body.transactionId);
          return Response.json({ applied: true });
        }
        if (url.endsWith("/report-processing-retry")) return Response.json({});
        throw new Error("Unexpected synthetic request");
      },
    );
    const env: Env = {
      MERCHANT_JOBS: {
        async sendBatch(batch: { body: MerchantCategorizeJob }[]) {
          pending.push(...batch.map((entry) => entry.body));
        },
      } as unknown as Queue<MerchantCategorizeJob>,
      MONARA_BACKEND_URL: "https://backend.test",
      MONARA_AGENT_BACKEND_SECRET: "synthetic",
      LLM_BASE_URL: "https://llm.test",
      LLM_API_KEY: "synthetic",
      LLM_MODEL: "synthetic",
      BRAVE_SEARCH_API_KEY: "synthetic",
    };
    const deliver = async (bodies: MerchantCategorizeJob[], attempts: number) =>
      consumeMerchantJobs(
        {
          messages: bodies.map((body) => ({
            body,
            attempts,
            ack() {},
            retry() {
              retries += 1;
            },
          })),
        } as unknown as MessageBatch<unknown>,
        env,
      );
    await deliver(
      [
        { kind: "merchant.categorize", transactionId: legacyId },
        { kind: "merchant.categorize", transactionIds },
      ],
      6,
    );
    let deliveries = 0;
    while (pending.length) {
      assert.ok(deliveries++ < 10, "administrative splitting must terminate");
      const body = pending.shift();
      assert.ok(body);
      await deliver([body], 1);
    }
    assert.equal(retries, 0, "final processing attempts must not become fresh provider retries");
    assert.deepEqual(terminalIds, [legacyId, ...transactionIds]);
    assert.equal(
      modelCalls,
      4,
      "one model rejection per final processing job, with no new retry budget",
    );
  });
  it("requeues legacy multi-message deliveries before sharing a provider request budget", async (t) => {
    const transactionIds = [
      "00000000-0000-4000-8000-000000000030",
      "00000000-0000-4000-8000-000000000031",
    ];
    const jobs = transactionIds.map((transactionId) => ({
      kind: "merchant.categorize" as const,
      transactionId,
    }));
    const requeued: MerchantCategorizeJob[] = [];
    let acked = 0;
    t.mock.method(globalThis, "fetch", async () =>
      assert.fail("fanout must precede provider work"),
    );
    await consumeMerchantJobs(
      {
        messages: jobs.map((body) => ({
          body,
          attempts: 1,
          ack() {
            acked += 1;
          },
        })),
      } as unknown as MessageBatch<unknown>,
      {
        MERCHANT_JOBS: {
          async sendBatch(batch: { body: MerchantCategorizeJob }[]) {
            requeued.push(...batch.map((entry) => entry.body));
          },
        } as unknown as Queue<MerchantCategorizeJob>,
      },
    );
    assert.deepEqual(requeued, jobs);
    assert.equal(acked, jobs.length);
  });
  it("gives each merchant job its own subrequest budget while keeping at most five jobs in parallel", async () => {
    const source = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    const config = JSON.parse(source.replace(/^\s*\/\/.*$/gm, ""));
    const consumer = config.queues.consumers.find(
      (entry: { queue: string }) => entry.queue === "monara-merchant-jobs",
    );
    assert.equal(consumer.max_batch_size, 1);
    assert.equal(consumer.max_concurrency * consumer.max_batch_size, 5);
  });
  for (const failCategoryWrite of [false, true]) {
    it(`fits three unique cold business lookups inside 50 subrequests${failCategoryWrite ? " with final write fallback" : ""}`, async (t) => {
      const transactionIds = Array.from(
        { length: 3 },
        (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
      );
      const publicNames = Object.values(brands)
        .filter((brand) => brand.kind === "merchant" && !/\p{N}/u.test(brand.name))
        .slice(0, transactionIds.length)
        .map((brand) => brand.name);
      const categoryId = "00000000-0000-4000-8000-000000000040";
      let subrequests = 0;
      let acked = false;
      let setCalls = 0;
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          subrequests += 1;
          assert.ok(
            subrequests <= 50,
            "the real worker path exceeded the invocation request budget",
          );
          const url = String(input);
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (url.endsWith("/resolve-imported-transaction")) {
            const name = publicNames[transactionIds.indexOf(body.transactionId)];
            return Response.json({
              merchantName: name,
              location: null,
              needsCategory: true,
              categoryNames: [],
              kind: "expense",
              flowDirection: "out",
              counterpartyName: name,
              counterpartyType: "business",
              categories: [
                { id: categoryId, name: "Food", kind: "expense", slug: "food", isDefault: true },
              ],
            });
          }
          if (url.endsWith("/claim-merchant-profile")) return Response.json({ status: "claimed" });
          if (url.endsWith("/save-merchant-profile")) return Response.json({});
          if (url.startsWith("https://api.search.brave.com/"))
            return Response.json({
              web: {
                results: [
                  {
                    title: "Public business",
                    description: "Synthetic description",
                    url: "https://public.test",
                  },
                ],
              },
            });
          if (url.endsWith("/chat/completions"))
            return Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ categoryId, kind: "expense", confidence: 0.99 }),
                  },
                },
              ],
            });
          if (url.endsWith("/set-imported-category")) {
            setCalls += 1;
            return failCategoryWrite && body.categoryId !== null
              ? new Response(null, { status: 503 })
              : Response.json({ applied: true });
          }
          throw new Error("Unexpected synthetic request");
        },
      );
      await consumeMerchantJobs(
        {
          messages: [
            {
              body: { kind: "merchant.categorize", transactionIds },
              attempts: 6,
              ack() {
                acked = true;
              },
              retry() {
                assert.fail("bounded final-attempt work must complete");
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
      assert.equal(acked, true);
      assert.equal(subrequests, failCategoryWrite ? 27 : 24);
      assert.equal(setCalls, failCategoryWrite ? 6 : 3);
    });
  }
  it("splits older large merchant jobs before provider work to bound invocation subrequests", async (t) => {
    const jobs: MerchantCategorizeJob[] = [];
    let acked = false;
    let retried = false;
    let providerCalls = 0;
    const transactionIds = Array.from(
      { length: 8 },
      (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    );
    t.mock.method(globalThis, "fetch", async () => {
      providerCalls += 1;
      return new Response(null, { status: 503 });
    });
    await consumeMerchantJobs(
      {
        messages: [
          {
            body: { kind: "merchant.categorize", transactionIds },
            attempts: 1,
            ack() {
              acked = true;
            },
            retry() {
              retried = true;
            },
          },
        ],
      } as unknown as MessageBatch<unknown>,
      {
        MERCHANT_JOBS: {
          async sendBatch(batch: { body: MerchantCategorizeJob }[]) {
            jobs.push(...batch.map((entry) => entry.body));
          },
        } as unknown as Queue<MerchantCategorizeJob>,
        MONARA_BACKEND_URL: "https://backend.test",
        MONARA_AGENT_BACKEND_SECRET: "synthetic",
        LLM_BASE_URL: "https://llm.test",
        LLM_API_KEY: "synthetic",
        LLM_MODEL: "synthetic",
        BRAVE_SEARCH_API_KEY: "synthetic",
      },
    );
    assert.equal(providerCalls, 0, "oversized jobs must be split before backend or provider calls");
    assert.equal(acked, true);
    assert.equal(retried, false);
    assert.deepEqual(
      jobs.map((job) => ("transactionIds" in job ? job.transactionIds.length : 1)),
      [3, 3, 2],
    );
    assert.deepEqual(
      jobs.flatMap((job) => ("transactionIds" in job ? job.transactionIds : [job.transactionId])),
      transactionIds,
    );
  });
  for (const fixture of [
    {
      name: "persists a busy merchant profile wait without searching",
      deadlineStatus: 200,
      busy: true,
      delay: 15,
    },
    {
      name: "keeps the busy merchant retry when deadline reporting fails",
      deadlineStatus: 503,
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
              merchantName: "Kopi Kenangan",
              location: null,
              needsCategory: true,
              categoryNames: [],
              kind: "expense",
              flowDirection: "out",
              counterpartyName: "Kopi Kenangan",
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
  for (const brave of [
    { name: "a rate-limited Brave search", key: "synthetic", status: 429 },
    { name: "a rejected Brave key", key: "synthetic", status: 401 },
    { name: "a missing Brave key", key: undefined, status: 0 },
  ]) {
    it(`categorizes from the model's knowledge after ${brave.name}`, async (t) => {
      let acked = false;
      let searches = 0;
      const applied: { categoryId: string | null }[] = [];
      const transactionIds = [
        "00000000-0000-4000-8000-000000000030",
        "00000000-0000-4000-8000-000000000031",
      ];
      const categoryId = "00000000-0000-4000-8000-000000000040";
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith("/resolve-imported-transaction"))
            return Response.json({
              merchantName: "Iga Ngebul",
              location: null,
              needsCategory: true,
              categoryNames: [],
              kind: "expense",
              flowDirection: "out",
              counterpartyName: "Iga Ngebul",
              counterpartyType: "business",
              categories: [
                { id: categoryId, name: "Food", kind: "expense", slug: "food", isDefault: true },
              ],
            });
          if (url.endsWith("/claim-merchant-profile")) return Response.json({ status: "claimed" });
          if (url.endsWith("/release-merchant-profile")) return Response.json({});
          if (url.startsWith("https://api.search.brave.com/")) {
            searches += 1;
            return new Response(null, { status: brave.status, headers: { "Retry-After": "125" } });
          }
          if (url.endsWith("/chat/completions"))
            return Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ categoryId, kind: "expense", confidence: 0.9 }),
                  },
                },
              ],
            });
          if (url.endsWith("/set-imported-category")) {
            applied.push(JSON.parse(String(init?.body)));
            return Response.json({ applied: true });
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
                acked = true;
              },
              retry() {
                assert.fail("a failed search must not delay categorization");
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
          ...(brave.key ? { BRAVE_SEARCH_API_KEY: brave.key } : {}),
        },
      );
      assert.equal(acked, true);
      assert.equal(searches, brave.key ? 1 : 0, "one shared search, or none without a key");
      assert.deepEqual(
        applied.map((entry) => entry.categoryId),
        [categoryId, categoryId],
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

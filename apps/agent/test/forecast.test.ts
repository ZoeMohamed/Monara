import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ForecastCandidate } from "@monara/contracts";
import type { Env } from "../src/env.ts";
import {
  dispatchDailyForecast,
  FORECAST_CRON,
  handleForecastRefine,
  judgeForecastCandidates,
} from "../src/forecast.ts";
import type { JsonCompletionRequest, LlmClient } from "../src/gmail/llm.ts";

// Synthetic data only.
const candidate: ForecastCandidate = {
  key: "youtube premium",
  merchantName: "YouTube Premium",
  pattern: "monthly",
  ruleConfidence: 0.95,
  amounts: [59000, 59000, 59000],
  dates: ["2026-07-20", "2026-08-20", "2026-09-20"],
  predictedOn: ["2026-10-20"],
};

function fakeLlm(output: unknown): LlmClient & { requests: JsonCompletionRequest[] } {
  const requests: JsonCompletionRequest[] = [];
  return {
    requests,
    async completeJson(request: JsonCompletionRequest) {
      requests.push(request);
      if (output instanceof Error) throw output;
      return output;
    },
  };
}

const env = { MONARA_AGENT_BACKEND_SECRET: "synthetic-secret" } as Env;
const call = (body: unknown, headers: Record<string, string>, llm: LlmClient | null) =>
  handleForecastRefine(
    new Request("https://agent.example/forecast/refine", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env,
    () => llm,
  );
const authorized = { authorization: "Bearer synthetic-secret" };

describe("judgeForecastCandidates", () => {
  it("sends the candidates as data and returns the judgements it asked for", async () => {
    const llm = fakeLlm({
      judgements: [
        { key: "youtube premium", confidence: 0.9, reason: "Paid on the 20th each month." },
      ],
    });
    const result = await judgeForecastCandidates(llm, [candidate]);
    assert.deepEqual(result, [
      { key: "youtube premium", confidence: 0.9, reason: "Paid on the 20th each month." },
    ]);
    assert.match(llm.requests[0]?.system ?? "", /untrusted data/);
    assert.equal(JSON.parse(llm.requests[0]?.user ?? "{}").candidates.length, 1);
  });

  it("drops judgements for candidates it did not send, and repeated ones", async () => {
    const llm = fakeLlm({
      judgements: [
        { key: "made up", confidence: 1, reason: "Trust me." },
        { key: "youtube premium", confidence: 0.8, reason: "First." },
        { key: "youtube premium", confidence: 0.1, reason: "Second." },
      ],
    });
    const result = await judgeForecastCandidates(llm, [candidate]);
    assert.deepEqual(
      result.map((item) => item.reason),
      ["First."],
    );
  });

  it("rejects an answer that does not match the schema", async () => {
    await assert.rejects(
      judgeForecastCandidates(fakeLlm({ judgements: [{ key: "x" }] }), [candidate]),
    );
  });
});

describe("POST /forecast/refine", () => {
  const ok = fakeLlm({
    judgements: [{ key: "youtube premium", confidence: 0.9, reason: "Regular." }],
  });

  it("answers 401 without the backend secret", async () => {
    assert.equal((await call({ candidates: [candidate] }, {}, ok)).status, 401);
    assert.equal(
      (await call({ candidates: [candidate] }, { authorization: "Bearer wrong" }, ok)).status,
      401,
    );
  });

  it("fails closed when the model is not configured", async () => {
    assert.equal((await call({ candidates: [candidate] }, authorized, null)).status, 503);
  });

  it("answers 400 for a malformed or empty request", async () => {
    assert.equal((await call({ candidates: [] }, authorized, ok)).status, 400);
    assert.equal((await call({ nope: true }, authorized, ok)).status, 400);
  });

  it("answers 502 when the model fails, without echoing the failure", async () => {
    const response = await call(
      { candidates: [candidate] },
      authorized,
      fakeLlm(new Error("provider said: secret detail")),
    );
    assert.equal(response.status, 502);
    assert.equal(JSON.stringify(await response.json()).includes("secret detail"), false);
  });

  it("returns the judgements", async () => {
    const response = await call({ candidates: [candidate] }, authorized, ok);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { judgements: unknown[] };
    assert.equal(body.judgements.length, 1);
  });
});

describe("nightly forecast cron", () => {
  it("asks the backend to refresh with the shared secret, and never throws", async () => {
    const original = globalThis.fetch;
    const calls: { url: string; auth: string | null }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("Authorization") });
      return Response.json({ refreshed: 3, failed: 0, nextCursor: null });
    }) as typeof fetch;
    try {
      await dispatchDailyForecast({
        MONARA_BACKEND_URL: "https://monara.test/",
        MONARA_AGENT_BACKEND_SECRET: "backend-secret",
      });
      assert.deepEqual(calls, [
        { url: "https://monara.test/api/agent/forecast/refresh", auth: "Bearer backend-secret" },
      ]);
      calls.length = 0;
      await dispatchDailyForecast({ MONARA_BACKEND_URL: "https://monara.test" });
      assert.equal(calls.length, 0);
      globalThis.fetch = (async () => {
        throw new Error("network down");
      }) as typeof fetch;
      await dispatchDailyForecast({
        MONARA_BACKEND_URL: "https://monara.test",
        MONARA_AGENT_BACKEND_SECRET: "backend-secret",
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("nightly forecast batches", () => {
  it("uses Jakarta midnight and continues beyond the first 25 Users", async () => {
    assert.equal(FORECAST_CRON, "0 17 * * *");
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({
        refreshed: calls.length === 1 ? 25 : 4,
        failed: 0,
        nextCursor: calls.length === 1 ? "91000000-0000-4000-8000-000000000025" : null,
      });
    }) as typeof fetch;
    try {
      await dispatchDailyForecast({
        MONARA_BACKEND_URL: "https://monara.test",
        MONARA_AGENT_BACKEND_SECRET: "synthetic-secret",
      });
      assert.equal(calls.length, 2);
      assert.equal(
        new URL(calls[1] ?? "").searchParams.get("after"),
        "91000000-0000-4000-8000-000000000025",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("stops when a backend returns a repeated cursor", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({
        refreshed: 0,
        failed: 0,
        nextCursor: "91000000-0000-4000-8000-000000000025",
      });
    }) as typeof fetch;
    try {
      await dispatchDailyForecast({
        MONARA_BACKEND_URL: "https://monara.test",
        MONARA_AGENT_BACKEND_SECRET: "synthetic-secret",
      });
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = original;
    }
  });
});

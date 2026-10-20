import assert from "node:assert/strict";
import { test } from "node:test";
import { handleBillReview, reviewBillCandidates } from "../src/bills.ts";
import type { Env } from "../src/env.ts";
import type { JsonCompletionRequest, LlmClient } from "../src/gmail/llm.ts";

const candidate = {
  key: "streamly",
  merchantName: "Streamly",
  intervalUnit: "month" as const,
  payments: [
    { occurredOn: "2026-07-10", amountMinor: "149000" },
    { occurredOn: "2026-08-10", amountMinor: "149000" },
    { occurredOn: "2026-09-10", amountMinor: "149000" },
  ],
};

function fakeLlm(output: unknown): LlmClient & { requests: JsonCompletionRequest[] } {
  const requests: JsonCompletionRequest[] = [];
  return {
    requests,
    async completeJson(request) {
      requests.push(request);
      return output;
    },
  };
}

const env: Env = { MONARA_AGENT_BACKEND_SECRET: "backend-secret" };
const request = (body: unknown, token = "backend-secret") =>
  new Request("https://agent.test/bills/review", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("keeps one judgement per candidate that was asked about", async () => {
  const llm = fakeLlm({
    judgements: [
      { key: "streamly", isBill: true, confidence: 0.9, reason: "A monthly subscription." },
      { key: "streamly", isBill: false, confidence: 0.1, reason: "Second answer." },
      { key: "invented", isBill: true, confidence: 1, reason: "Not asked." },
    ],
  });
  const judgements = await reviewBillCandidates(llm, [candidate]);
  assert.deepEqual(judgements, [
    { key: "streamly", isBill: true, confidence: 0.9, reason: "A monthly subscription." },
  ]);
  assert.match(llm.requests[0]?.system ?? "", /untrusted data/);
  assert.doesNotMatch(llm.requests[0]?.user ?? "", /userId|financialAccountId/);
});

test("the review endpoint needs the backend secret and a valid body", async () => {
  const llm = fakeLlm({ judgements: [] });
  const unauthorized = await handleBillReview(
    request({ candidates: [candidate] }, "wrong"),
    env,
    () => llm,
  );
  assert.equal(unauthorized.status, 401);
  const invalid = await handleBillReview(request({ candidates: [] }), env, () => llm);
  assert.equal(invalid.status, 400);
  const unconfigured = await handleBillReview(request({ candidates: [candidate] }), {}, () => llm);
  assert.equal(unconfigured.status, 503);
  assert.equal(llm.requests.length, 0);
});

test("the review endpoint answers with judgements, or 502 when the model fails", async () => {
  const ok = await handleBillReview(request({ candidates: [candidate] }), env, () =>
    fakeLlm({
      judgements: [{ key: "streamly", isBill: true, confidence: 0.9, reason: "Subscription." }],
    }),
  );
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { judgements: unknown[] }).judgements.length, 1);
  const broken = await handleBillReview(request({ candidates: [candidate] }), env, () =>
    fakeLlm({ nonsense: true }),
  );
  assert.equal(broken.status, 502);
});

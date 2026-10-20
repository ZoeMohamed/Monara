import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { refineWithAgent } from "./refine.ts";

const candidate = {
  key: "youtube premium",
  merchantName: "YouTube Premium",
  pattern: "monthly",
  ruleConfidence: 0.95,
  amounts: [59000],
  dates: ["2026-09-20"],
  predictedOn: ["2026-10-20"],
};
const env = { agentUrl: "https://agent.example", secret: "synthetic-secret" };

describe("refineWithAgent", () => {
  it("sends the candidates with the backend secret and returns the judgements", async () => {
    let seen;
    const refine = refineWithAgent(env, async (url, init) => {
      seen = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
      return Response.json({
        judgements: [{ key: "youtube premium", confidence: 0.9, reason: "Regular." }],
      });
    });
    const result = await refine([candidate]);
    assert.equal(seen.url, "https://agent.example/forecast/refine");
    assert.equal(seen.headers.Authorization, "Bearer synthetic-secret");
    assert.equal(seen.body.candidates.length, 1);
    assert.equal(result[0].reason, "Regular.");
  });

  it("returns null without configuration, so the rules stand alone", async () => {
    assert.equal(
      await refineWithAgent({}, async () => assert.fail("no call expected"))([candidate]),
      null,
    );
  });

  it("returns null when the Agent fails, answers badly, or is unreachable", async () => {
    assert.equal(
      await refineWithAgent(env, async () => new Response("no", { status: 502 }))([candidate]),
      null,
    );
    assert.equal(
      await refineWithAgent(env, async () => Response.json({ judgements: [{ key: 1 }] }))([
        candidate,
      ]),
      null,
    );
    assert.equal(
      await refineWithAgent(env, async () => {
        throw new Error("network");
      })([candidate]),
      null,
    );
  });
});

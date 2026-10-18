import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLlmClient, LlmError } from "../src/gmail/llm.ts";

describe("Gmail LLM client", () => {
  it("uses provider defaults instead of forcing an unsupported temperature", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const llm = createLlmClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "test-key",
      model: "test-model",
      async fetcher(_input, init) {
        requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
      },
    });

    await llm.completeJson({
      system: "system",
      user: "user",
      schemaName: "smoke",
      schema: { type: "object" },
    });

    assert.ok(requestBody);
    assert.equal(Object.hasOwn(requestBody, "temperature"), false);
  });
});

describe("busy or failing model providers", () => {
  const request = { system: "s", user: "u", schemaName: "t", schema: { type: "object" } };
  const answer = () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });

  function client(responses: (() => Response)[], waits: number[] = []) {
    let calls = 0;
    const llm = createLlmClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "test-key",
      model: "test-model",
      async fetcher() {
        const next = responses[Math.min(calls, responses.length - 1)];
        calls += 1;
        if (!next) throw new Error("no response");
        return next();
      },
      async sleep(ms) {
        waits.push(ms);
      },
    });
    return { llm, calls: () => calls };
  }

  it("caps the answer length so a rate limit is not spent on unused output", async () => {
    let body: Record<string, unknown> = {};
    const llm = createLlmClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "k",
      model: "m",
      async fetcher(_input, init) {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return answer();
      },
    });
    await llm.completeJson(request);
    assert.equal(body.max_tokens, 2000);
  });

  it("waits out a short rate limit in the same call, as long as the provider asks", async () => {
    const waits: number[] = [];
    const { llm, calls } = client(
      [() => new Response(null, { status: 429, headers: { "retry-after-ms": "1500" } }), answer],
      waits,
    );
    assert.deepEqual(await llm.completeJson(request), { ok: true });
    assert.equal(calls(), 2);
    assert.ok((waits[0] ?? 0) >= 1500 && (waits[0] ?? 0) < 2000);
  });

  it("hands a long wait back to the caller with how long to wait", async () => {
    const { llm, calls } = client([
      () => new Response(null, { status: 429, headers: { "retry-after": "60" } }),
    ]);
    await assert.rejects(llm.completeJson(request), (error: unknown) => {
      assert.ok(error instanceof LlmError);
      assert.equal(error.failure, "rate_limited");
      assert.equal(error.retryAfterMs, 60_000);
      return true;
    });
    assert.equal(calls(), 1);
  });

  it("reads a provider error inside a 200 and a body cut off after OpenRouter's padding", async () => {
    const inBody = client([() => Response.json({ error: { code: 429, message: "slow down" } })]);
    await assert.rejects(inBody.llm.completeJson(request), { failure: "rate_limited" });
    assert.equal(inBody.calls(), 3);

    const cut = client([() => new Response('\n   \n{"id":"gen-1","choi', { status: 200 })]);
    await assert.rejects(cut.llm.completeJson(request), { failure: "unavailable" });

    const padded = client([
      () =>
        new Response(
          `\n  \n${JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] })}`,
        ),
    ]);
    assert.deepEqual(await padded.llm.completeJson(request), { ok: 1 });
  });

  it("never retries a rejected request such as a bad key", async () => {
    const { llm, calls } = client([() => new Response(null, { status: 401 })]);
    await assert.rejects(llm.completeJson(request), { failure: "failed", status: 401 });
    assert.equal(calls(), 1);
  });
});

describe("reasoning models", () => {
  const request = { system: "s", user: "u", schemaName: "t", schema: { type: "object" } };

  async function bodyFor(baseUrl: string, model: string, reasoningEffort?: string) {
    let body: Record<string, unknown> = {};
    const llm = createLlmClient({
      baseUrl,
      apiKey: "k",
      model,
      reasoningEffort,
      async fetcher(_input, init) {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ choices: [{ message: { content: "{}" } }] });
      },
    });
    await llm.completeJson({ ...request, maxOutputTokens: 1500 });
    return body;
  }

  it("sends Azure's max_completion_tokens and low effort, with room to reason, for gpt-5", async () => {
    const body = await bodyFor("https://res.openai.azure.com/openai/v1", "gpt-5.4-mini");
    assert.equal(body.max_completion_tokens, 3500);
    assert.equal(body.reasoning_effort, "low");
    assert.equal(Object.hasOwn(body, "max_tokens"), false);
  });

  it("sends no effort to a non-reasoning model, and honors a set effort for a renamed deployment", async () => {
    const plain = await bodyFor("https://res.openai.azure.com/openai/v1", "gpt-4o-mini");
    assert.equal(plain.max_completion_tokens, 1500);
    assert.equal(Object.hasOwn(plain, "reasoning_effort"), false);
    const renamed = await bodyFor("https://res.openai.azure.com/openai/v1", "parser", "minimal");
    assert.equal(renamed.reasoning_effort, "minimal");
  });

  it("uses OpenRouter's own fields", async () => {
    const body = await bodyFor("https://openrouter.ai/api/v1", "openai/gpt-5-mini");
    assert.equal(body.max_tokens, 3500);
    assert.deepEqual(body.reasoning, { effort: "low" });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLlmClient } from "../src/gmail/llm.ts";

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

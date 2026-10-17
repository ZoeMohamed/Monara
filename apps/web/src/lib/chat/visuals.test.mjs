import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpectedChatVisualUrl } from "./visuals.ts";

describe("chat visual storage source", () => {
  const configured = "https://synthetic.supabase.co";
  const path = "/storage/v1/object/sign/chat-visuals/synthetic/chart.png?token=synthetic";

  it("permits only the configured HTTPS storage origin, including an explicitly configured custom domain", () => {
    assert.equal(isExpectedChatVisualUrl(`${configured}${path}`, configured), true);
    assert.equal(
      isExpectedChatVisualUrl(
        `https://storage.example.test${path}`,
        "https://storage.example.test",
      ),
      true,
    );
    for (const source of [
      "https://other.supabase.co",
      "https://evil.example",
      "https://synthetic.supabase.co.evil.example",
      "http://synthetic.supabase.co",
      "https://synthetic.supabase.co:8443",
    ])
      assert.equal(isExpectedChatVisualUrl(`${source}${path}`, configured), false);
  });

  it("fails closed without valid public storage configuration", () => {
    assert.equal(isExpectedChatVisualUrl(`${configured}${path}`, undefined), false);
    assert.equal(isExpectedChatVisualUrl(`${configured}${path}`, "invalid"), false);
    assert.equal(isExpectedChatVisualUrl("invalid", configured), false);
    assert.equal(
      isExpectedChatVisualUrl(`http://localhost:54321${path}`, "http://localhost:54321"),
      false,
    );
  });
});

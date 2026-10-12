import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkSupabaseConnectivity, parsePublicSupabaseConfig } from "./index.ts";

describe("public Supabase configuration", () => {
  it("accepts HTTPS projects and local HTTP stacks", () => {
    assert.deepEqual(
      parsePublicSupabaseConfig({
        url: "https://example.supabase.co/",
        publishableKey: "publishable-key",
      }),
      { url: "https://example.supabase.co", publishableKey: "publishable-key" },
    );
    assert.equal(
      parsePublicSupabaseConfig({
        url: "http://127.0.0.1:54321",
        publishableKey: "local-key",
      }).url,
      "http://127.0.0.1:54321",
    );
  });

  it("fails closed for missing keys and insecure remote URLs", () => {
    assert.throws(
      () => parsePublicSupabaseConfig({ url: "https://example.supabase.co", publishableKey: "" }),
      /Missing required Supabase configuration/,
    );
    assert.throws(
      () => parsePublicSupabaseConfig({ url: "http://example.com", publishableKey: "key" }),
      /must use HTTPS/,
    );
  });
});

describe("Supabase connectivity", () => {
  const config = { url: "https://example.supabase.co", publishableKey: "public-key" };

  it("checks the authenticated Auth gateway without exposing a service-role key", async () => {
    let observed;
    const result = await checkSupabaseConnectivity(config, async (input, init) => {
      observed = { input, init };
      return new Response(null, { status: 200 });
    });
    assert.deepEqual(result, { connected: true });
    assert.equal(observed.input, "https://example.supabase.co/auth/v1/settings");
    assert.equal(observed.init.headers.apikey, "public-key");
    assert.equal("authorization" in observed.init.headers, false);
  });

  it("fails explicitly when Supabase is unavailable", async () => {
    await assert.rejects(
      checkSupabaseConnectivity(config, async () => new Response(null, { status: 503 })),
      /status 503/,
    );
  });
});

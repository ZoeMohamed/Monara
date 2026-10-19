import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BraveSearchError, createBraveSearchClient } from "./brave.ts";

function fakeFetcher(response) {
  const calls = [];
  return {
    calls,
    async fetcher(url, init) {
      calls.push({ url, init });
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: response.headers,
      });
    },
  };
}

describe("Brave Search", () => {
  it("sends only the query with the key in a header and returns plain results", async () => {
    const { fetcher, calls } = fakeFetcher({
      body: {
        web: {
          results: [
            {
              title: "<strong>Kopi</strong> Kenangan",
              description: "Coffee shop chain in Indonesia",
              url: "https://kopikenangan.com",
            },
            { title: "", description: "" },
            "not a result",
          ],
        },
      },
    });
    const client = createBraveSearchClient({ apiKey: "test-key", fetcher });
    const results = await client.search("Kopi Kenangan");

    assert.deepEqual(results, [
      {
        title: "Kopi Kenangan",
        description: "Coffee shop chain in Indonesia",
        url: "https://kopikenangan.com",
      },
    ]);
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("q"), "Kopi Kenangan");
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(calls[0].init.headers["X-Subscription-Token"], "test-key");
  });

  it("reports rate limiting and failures without response bodies", async () => {
    const limited = createBraveSearchClient({
      apiKey: "test-key",
      fetcher: fakeFetcher({ status: 429, body: { secret: "x" } }).fetcher,
    });
    await assert.rejects(limited.search("Kopi"), (error) => {
      assert.ok(error instanceof BraveSearchError);
      assert.equal(error.rateLimited, true);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
    const unreachable = createBraveSearchClient({
      apiKey: "test-key",
      fetcher: fakeFetcher(new Error("offline")).fetcher,
    });
    await assert.rejects(unreachable.search("Kopi"), { name: "BraveSearchError", status: null });
  });

  it("preserves Retry-After seconds and HTTP dates without printing provider bodies", async () => {
    for (const [header, expected] of [
      ["75", 75000],
      ["invalid", null],
    ]) {
      const client = createBraveSearchClient({
        apiKey: "test-key",
        fetcher: fakeFetcher({ status: 429, headers: { "Retry-After": header } }).fetcher,
      });
      await assert.rejects(client.search("Kopi"), (error) => error.retryAfterMs === expected);
    }
    const later = new Date(Date.now() + 120000).toUTCString();
    const client = createBraveSearchClient({
      apiKey: "test-key",
      fetcher: fakeFetcher({ status: 503, headers: { "Retry-After": later } }).fetcher,
    });
    await assert.rejects(
      client.search("Kopi"),
      (error) => error.retryAfterMs > 118000 && error.retryAfterMs <= 120000,
    );
  });

  it("refuses to start without a key", () => {
    assert.throws(() => createBraveSearchClient({ apiKey: " " }), /BRAVE_SEARCH_API_KEY/);
  });
});

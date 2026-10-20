import assert from "node:assert/strict";
import test from "node:test";
import { createFxService } from "./fx.ts";

const snapshot = {
  rate: "16008",
  rateDate: "2024-05-15",
  requestedOn: "2024-05-15",
  source: "frankfurter_ecb",
  rounding: "half_up_rupiah",
};
const emptyCache = { load: async () => null, save: async (value) => value };

test("cached historical rates avoid network access", async () => {
  const fx = createFxService(
    { ...emptyCache, load: async () => snapshot },
    {
      fetcher: () => {
        throw Error("network must not run");
      },
    },
  );
  assert.deepEqual(await fx.rateFor("2024-05-15"), snapshot);
});

test("concurrent same-day lookups share one request and persist a dated ECB rate", async () => {
  let calls = 0;
  const fx = createFxService(emptyCache, {
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("providers"), "ecb");
      assert.equal(url.searchParams.get("date"), "2024-05-15");
      assert.deepEqual([...url.searchParams.keys()], ["date", "providers"]);
      return Response.json({ date: "2024-05-15", base: "USD", quote: "IDR", rate: 16008 });
    },
  });
  const results = await Promise.all([fx.rateFor("2024-05-15"), fx.rateFor("2024-05-15")]);
  assert.deepEqual(results, [snapshot, snapshot]);
  assert.equal(calls, 1);
});

test("the deadline bounds a hung cache, provider, or response body even when abort is ignored", async () => {
  for (const mode of ["cache", "fetch", "body"]) {
    const never = () => new Promise(() => {});
    const fx = createFxService(mode === "cache" ? { ...emptyCache, load: never } : emptyCache, {
      timeoutMs: 15,
      fetcher:
        mode === "fetch" ? never : async () => new Response(new ReadableStream({ start() {} })),
    });
    const started = performance.now();
    assert.equal(await fx.rateFor("2024-05-15"), null);
    assert.ok(performance.now() - started < 250, mode);
  }
});

test("bad, future-dated and non-success responses never create a conversion", async () => {
  for (const response of [
    new Response("offline", { status: 503 }),
    Response.json({ date: "2024-05-16", base: "USD", quote: "IDR", rate: 16008 }),
    Response.json({ date: "2024-05-15", base: "IDR", quote: "USD", rate: 0.00006 }),
    Response.json({ date: "2024-05-15", base: "USD", quote: "IDR", rate: 0 }),
  ]) {
    let saved = false;
    const fx = createFxService(
      {
        ...emptyCache,
        save: async (value) => {
          saved = true;
          return value;
        },
      },
      { fetcher: async () => response },
    );
    assert.equal(await fx.rateFor("2024-05-15"), null);
    assert.equal(saved, false);
  }
});

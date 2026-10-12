import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");

function harness(fetcher = async () => new Response("network"), storageFailure) {
  const handlers = new Map();
  const stores = new Map();
  const requests = [];
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      match: async (key) => {
        if (storageFailure === "match") throw new Error("Cache read failed");
        return data.get(key)?.clone();
      },
      put: async (key, value) => {
        if (storageFailure === "put") throw new Error("QuotaExceededError");
        return data.set(key, value.clone());
      },
    };
  };
  vm.runInNewContext(source, {
    URL,
    Response,
    Map,
    Promise,
    self: {
      location: { origin: "https://monara.test" },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (name) => {
        if (storageFailure === "open") throw new Error("Cache storage unavailable");
        return cache(name);
      },
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (...args) => {
      requests.push(args);
      return fetcher(...args);
    },
  });
  return {
    stores,
    requests,
    cache,
    async dispatch(type, request) {
      const waits = [];
      let response;
      handlers.get(type)({
        request,
        waitUntil: (promise) => waits.push(promise),
        respondWith: (promise) => {
          response = promise;
        },
      });
      const result = response ? await response : undefined;
      await Promise.all(waits);
      return result;
    },
  };
}
function request(path, options = {}) {
  return {
    url: `https://monara.test${path}`,
    method: "GET",
    mode: "cors",
    headers: new Headers(),
    ...options,
  };
}

test("personalized navigations use the network without storing HTML", async () => {
  const h = harness(async () => new Response("private financial data"));
  const result = await h.dispatch("fetch", request("/connections/gmail", { mode: "navigate" }));
  assert.equal(await result.text(), "private financial data");
  assert.equal(h.stores.size, 0);
});

test("offline navigation returns only the generic fallback, never an old cached page", async () => {
  const h = harness(async () => {
    throw new Error("offline");
  });
  await h.cache("monara-shell-v3").put("/", new Response("old private page"));
  await h.cache("monara-shell-v5").put("/offline.html", new Response("generic offline"));
  const response = await h.dispatch("fetch", request("/", { mode: "navigate" }));
  assert.equal(await response.text(), "generic offline");
});

test("offline navigation returns an uncached generic message when fallback storage is unavailable", async () => {
  for (const failure of [undefined, "open", "match"]) {
    const h = harness(async () => {
      throw new Error("offline");
    }, failure);
    await h.cache("monara-shell-v3").put("/", new Response("old private page"));
    const response = await h.dispatch("fetch", request("/", { mode: "navigate" }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "You are offline. Reconnect to use Monara.");
  }
});

test("auth, financial API, RSC and unauthorized asset paths bypass worker caches", async () => {
  const h = harness();
  for (const path of [
    "/auth/callback?code=secret",
    "/api/transactions",
    "/?_rsc=x",
    "/icons/private.png",
    "/icons/icon-192.png?user=1",
    "/_next/static/example.js",
  ]) {
    assert.equal(await h.dispatch("fetch", request(path)), undefined);
  }
  assert.equal(
    await h.dispatch(
      "fetch",
      request("/icons/icon-192.png", { headers: new Headers({ authorization: "synthetic" }) }),
    ),
    undefined,
  );
  assert.equal(
    await h.dispatch("fetch", request("/", { headers: new Headers({ RSC: "1" }) })),
    undefined,
  );
  assert.equal(h.requests.length, 0);
});

test("public assets are fetched without credentials and cached", async () => {
  const h = harness(
    async () => new Response("image", { headers: { "Content-Type": "image/png" } }),
  );
  await h.dispatch("fetch", request("/icons/icon-192.png"));
  await h.dispatch("fetch", request("/icons/icon-192.png"));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0][1].credentials, "omit");
  assert.equal(h.requests[0][1].redirect, "error");
});

test("public network assets remain usable when cache storage fails", async () => {
  for (const failure of ["open", "match", "put"]) {
    const h = harness(
      async () => new Response("public image", { headers: { "Content-Type": "image/png" } }),
      failure,
    );
    const response = await h.dispatch("fetch", request("/icons/icon-192.png"));
    assert.equal(await response.text(), "public image", failure);
    assert.equal(h.requests.length, 1, failure);
    assert.equal(h.requests[0][1].credentials, "omit", failure);
    if (failure === "put") assert.equal(h.stores.get("monara-shell-v5").size, 0);
  }
});

test("private, no-store, wrong MIME and failed assets pass through but never enter the cache", async () => {
  for (const options of [
    { headers: { "Content-Type": "image/png", "Cache-Control": "private" } },
    { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } },
    { headers: { "Content-Type": "text/html" } },
    { status: 500, headers: { "Content-Type": "image/png" } },
  ]) {
    for (const failure of [undefined, "open", "match", "put"]) {
      const h = harness(async () => new Response("sensitive", options), failure);
      const response = await h.dispatch("fetch", request("/icons/icon-192.png"));
      assert.equal(response.status, options.status ?? 200);
      assert.equal(h.stores.get("monara-shell-v5")?.size ?? 0, 0);
    }
  }
});

test("activation removes old Monara caches and preserves unrelated caches", async () => {
  const h = harness();
  h.cache("monara-shell-v2");
  h.cache("monara-shell-v3");
  h.cache("monara-shell-v4");
  h.cache("monara-shell-v5");
  h.cache("other-app");
  await h.dispatch("activate");
  assert.deepEqual([...h.stores.keys()], ["monara-shell-v5", "other-app"]);
});

test("installation never requests application HTML and requires an offline fallback", async () => {
  const h = harness(
    async (path) =>
      new Response("public", {
        headers: {
          "Content-Type":
            path === "/offline.html"
              ? "text/html"
              : path.endsWith(".png")
                ? "image/png"
                : "application/manifest+json",
        },
      }),
  );
  await h.dispatch("install");
  assert.ok(h.requests.every(([path, options]) => path !== "/" && options.credentials === "omit"));
  assert.ok(h.stores.get("monara-shell-v5").has("/offline.html"));
  const failing = harness(
    async () =>
      new Response("private", {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      }),
  );
  await assert.rejects(failing.dispatch("install"), /Public asset unavailable/);
  const full = harness(
    async () => new Response("public fallback", { headers: { "Content-Type": "text/html" } }),
    "put",
  );
  await assert.rejects(full.dispatch("install"), /QuotaExceededError/);
});

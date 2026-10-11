const CACHE_NAME = "monara-shell-v5";
const PUBLIC_ASSETS = new Map([
  ["/offline.html", "text/html"],
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/icons/icon-192.png", "image/png"],
  ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-maskable-512.png", "image/png"],
  ["/icons/apple-touch-icon.png", "image/png"],
]);

function isPublicResponse(response, path) {
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  return response.ok && !response.redirected &&
    mime === PUBLIC_ASSETS.get(path) &&
    !/(?:no-store|private)/i.test(response.headers.get("cache-control") || "");
}

function fetchPublicAsset(path) {
  return fetch(path, { credentials: "omit", cache: "reload", redirect: "error" });
}

async function loadPublicAsset(path) {
  const response = await fetchPublicAsset(path);
  if (!isPublicResponse(response, path)) throw new Error("Public asset unavailable");
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // A working, generic fallback is required before replacing the old worker.
    await cache.put("/offline.html", await loadPublicAsset("/offline.html"));
    await Promise.allSettled([...PUBLIC_ASSETS.keys()].filter((path) => path !== "/offline.html")
      .map(async (path) => cache.put(path, await loadPublicAsset(path))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("monara-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Auth, API and React Server Component requests always use the network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") ||
      request.headers.has("rsc") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match("/offline.html");
        if (fallback) return fallback;
      } catch {
        // The generic message also works when offline storage is unavailable.
      }
      return new Response("You are offline. Reconnect to use Monara.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }));
    return;
  }

  if (!PUBLIC_ASSETS.has(url.pathname) || url.search || request.headers.has("authorization")) return;
  let storing = Promise.resolve();
  const response = (async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
    } catch {
      // Storage availability must not prevent a public asset from using the network.
    }
    const fresh = await fetchPublicAsset(url.pathname);
    // Only a verified public response is stored; anything else passes through uncached.
    if (cache && isPublicResponse(fresh, url.pathname)) {
      // A full or unavailable cache does not invalidate the public response.
      storing = cache.put(url.pathname, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  })();
  event.respondWith(response);
  event.waitUntil(response.then(() => storing, () => undefined));
});

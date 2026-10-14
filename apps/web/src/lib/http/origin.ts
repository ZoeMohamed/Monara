/**
 * Returns the public origin that the browser used for this request.
 *
 * `next dev --hostname 0.0.0.0` exposes its bind address through `request.url`.
 * OAuth callbacks must instead use the forwarded/Host header so cookies return
 * to the same hostname the browser opened (normally localhost in development).
 */
export function browserOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname !== "0.0.0.0" && url.hostname !== "[::]") return url.origin;

  const host = request.headers.get("host")?.trim();
  if (!host) return url.origin;
  // The developer's own `pnpm dev:tunnel` domain, which ngrok serves over HTTPS.
  const ngrokDomain = process.env.NGROK_DOMAIN?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (ngrokDomain && host.toLowerCase() === ngrokDomain) return `https://${host}`;
  try {
    const candidate = new URL(`${url.protocol}//${host}`);
    return ["localhost", "127.0.0.1", "[::1]"].includes(candidate.hostname)
      ? candidate.origin
      : url.origin;
  } catch {
    return url.origin;
  }
}

/**
 * Cookie-authenticated mutations accept only requests the browser itself marks
 * as same-origin. Fetch metadata is preferred; older browsers fall back to an
 * exact Origin match. A missing or opaque origin is refused.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  return origin === browserOrigin(request);
}

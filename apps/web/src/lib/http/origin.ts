/** A developer-configured public HTTPS hostname, never a forwarding header. */
export function configuredTunnelOrigin(domain = process.env.NGROK_DOMAIN): string | null {
  if (!domain?.trim()) return null;
  try {
    const value = domain.trim();
    const absolute = value.includes("://") ? value : `https://${value}`;
    const url = new URL(absolute);
    const publicHostname = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      absolute.toLowerCase().replace(/\/$/, "") !== url.origin ||
      !publicHostname.test(url.hostname) ||
      /\.(localhost|local|internal|test|invalid|example)$/i.test(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns the public origin that the browser used for this request.
 *
 * `next dev --hostname 0.0.0.0` exposes its bind address through `request.url`.
 * OAuth callbacks must instead use a validated Host header so cookies return
 * to the same hostname the browser opened (normally localhost in development).
 */
export function browserOrigin(request: Request): string {
  const url = new URL(request.url);
  const bindAddress = url.hostname === "0.0.0.0" || url.hostname === "[::]";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!bindAddress && !loopback) return url.origin;

  const host = request.headers.get("host")?.trim();
  if (!host) return url.origin;
  // The developer's own `pnpm dev:tunnel` domain, which ngrok serves over HTTPS.
  const tunnelOrigin = configuredTunnelOrigin();
  if (tunnelOrigin && host.toLowerCase() === new URL(tunnelOrigin).host) return tunnelOrigin;
  if (!bindAddress) return url.origin;
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

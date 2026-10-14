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
  try {
    const candidate = new URL(`${url.protocol}//${host}`);
    return ["localhost", "127.0.0.1", "[::1]"].includes(candidate.hostname)
      ? candidate.origin
      : url.origin;
  } catch {
    return url.origin;
  }
}

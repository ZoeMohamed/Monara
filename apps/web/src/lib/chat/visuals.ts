/** Configured storage origin, never the URL's path alone, establishes the image source. */
export function isExpectedChatVisualUrl(
  url: string,
  configuredSupabaseUrl: string | undefined,
): boolean {
  if (!configuredSupabaseUrl) return false;
  try {
    const expected = new URL(configuredSupabaseUrl);
    const candidate = new URL(url);
    return expected.protocol === "https:" && candidate.origin === expected.origin;
  } catch {
    return false;
  }
}

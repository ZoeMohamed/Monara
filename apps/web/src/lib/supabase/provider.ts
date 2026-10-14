import type { PublicSupabaseConfig } from "@monara/db";

type AuthSettingsFetch = (input: string, init: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fails closed unless Supabase explicitly reports the Google provider as enabled. */
export async function isGoogleSignInAvailable(
  config: PublicSupabaseConfig,
  fetcher: AuthSettingsFetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(`${config.url}/auth/v1/settings`, {
      cache: "no-store",
      headers: { apikey: config.publishableKey },
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;

    const settings: unknown = await response.json();
    if (!isRecord(settings) || !isRecord(settings.external)) return false;
    return settings.external.google === true;
  } catch {
    return false;
  }
}

import type { CookieMethodsServer } from "@supabase/ssr";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";

export type { Database } from "./types/database.types.ts";

export interface PublicSupabaseConfig {
  publishableKey: string;
  url: string;
}

export interface SupabaseConnectivity {
  connected: true;
}

type ConnectivityFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Returns a trimmed required configuration value or fails closed. */
function requireValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required Supabase configuration: ${name}.`);
  }
  return normalized;
}

/** Validates the browser-safe URL and publishable key used by Supabase clients. */
export function parsePublicSupabaseConfig(values: {
  publishableKey: string | undefined;
  url: string | undefined;
}): PublicSupabaseConfig {
  const url = requireValue("NEXT_PUBLIC_SUPABASE_URL", values.url);
  const publishableKey = requireValue(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    values.publishableKey,
  );

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }
  const localHttp =
    parsedUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localHttp) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS outside local development.");
  }

  return { publishableKey, url: parsedUrl.origin };
}

/** Creates a browser Supabase client from already validated public configuration. */
export function createMonaraBrowserClient(config: PublicSupabaseConfig) {
  return createBrowserClient<Database>(config.url, config.publishableKey);
}

/**
 * Creates a service-role client that bypasses RLS. Server-only: call it after
 * the caller is authenticated, and scope every query to the verified User.
 */
export function createMonaraServiceRoleClient(
  config: PublicSupabaseConfig,
  serviceRoleKey: string | undefined,
) {
  const key = requireValue("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  return createClient<Database>(config.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export type MonaraServiceRoleClient = ReturnType<typeof createMonaraServiceRoleClient>;

/** Creates a cookie-aware server Supabase client without reading ambient secrets. */
export function createMonaraServerClient(
  config: PublicSupabaseConfig,
  cookies: CookieMethodsServer,
) {
  return createServerClient<Database>(config.url, config.publishableKey, { cookies });
}

/** Verifies that the configured endpoint returns the public Supabase Auth settings shape. */
export async function checkSupabaseConnectivity(
  config: PublicSupabaseConfig,
  fetcher: ConnectivityFetch = fetch,
): Promise<SupabaseConnectivity> {
  const response = await fetcher(`${config.url}/auth/v1/settings`, {
    cache: "no-store",
    headers: {
      apikey: config.publishableKey,
    },
    method: "GET",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase health check failed with status ${response.status}.`);
  }

  let settings: unknown;
  try {
    settings = await response.json();
  } catch {
    throw new Error("Supabase health check returned invalid JSON.");
  }
  if (
    typeof settings !== "object" ||
    settings === null ||
    !("external" in settings) ||
    typeof settings.external !== "object" ||
    settings.external === null ||
    Array.isArray(settings.external)
  ) {
    throw new Error("Supabase health check returned an unexpected Auth settings response.");
  }

  return { connected: true };
}

import { type PublicSupabaseConfig, parsePublicSupabaseConfig } from "@monara/db";

/** Reads and validates only the browser-safe Supabase environment variables. */
export function publicSupabaseConfig() {
  return parsePublicSupabaseConfig({
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

/** Missing or invalid public configuration cannot establish an authenticated session. */
export function availablePublicSupabaseConfig(
  values = {
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
): PublicSupabaseConfig | null {
  try {
    return parsePublicSupabaseConfig(values);
  } catch {
    return null;
  }
}

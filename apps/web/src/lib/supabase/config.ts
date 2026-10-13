import { parsePublicSupabaseConfig } from "@monara/db";

/** Reads and validates only the browser-safe Supabase environment variables. */
export function publicSupabaseConfig() {
  return parsePublicSupabaseConfig({
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

import { parsePublicSupabaseConfig } from "@monara/db";

export function publicSupabaseConfig() {
  return parsePublicSupabaseConfig({
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

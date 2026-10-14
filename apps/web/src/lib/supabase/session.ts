import type { UserId } from "@monara/contracts";
import { createMonaraServerClient } from "@monara/db";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "./config";

/**
 * Returns the signed-in User from the Supabase session cookie, verified with
 * Supabase Auth, or null. Never accept a user id from the request instead.
 */
export async function getSignedInUserId(): Promise<UserId | null> {
  const cookieStore = await cookies();
  const supabase = createMonaraServerClient(publicSupabaseConfig(), {
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => {
      for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
    },
  });
  const { data, error } = await supabase.auth.getUser();
  return error ? null : (data.user?.id ?? null);
}

import { createMonaraServerClient } from "@monara/db";
import { cookies } from "next/headers";

import { identityFromVerifiedClaims } from "@/lib/auth/identity";
import { availablePublicSupabaseConfig, publicSupabaseConfig } from "@/lib/supabase/config";

/** Creates one request-scoped server client backed by Supabase Auth cookies. */
export async function createServerSupabaseClient(config = publicSupabaseConfig()) {
  const cookieStore = await cookies();

  return createMonaraServerClient(config, {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components cannot write cookies. The request Proxy refreshes them.
      }
    },
  });
}

/** Verifies the JWT signature before trusting the caller's identity. */
export async function getAuthenticatedIdentity() {
  const config = availablePublicSupabaseConfig();
  if (!config) return null;

  const supabase = await createServerSupabaseClient(config);
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return identityFromVerifiedClaims(data?.claims);
}

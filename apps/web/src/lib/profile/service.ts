import { createProfileService, createSupabaseProfileRepository } from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";

/** Builds the profile service from server-only configuration; a missing key fails closed. */
export function profileService() {
  return createProfileService(
    createSupabaseProfileRepository(
      createMonaraServiceRoleClient(publicSupabaseConfig(), process.env.SUPABASE_SERVICE_ROLE_KEY),
    ),
  );
}

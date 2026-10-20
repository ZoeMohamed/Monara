import {
  createSupabaseFinanceRepository,
  createSupabaseGoalImageUploadRepository,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";

export function goalImageBackend() {
  const client = createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    client,
    repository: createSupabaseFinanceRepository(client),
    uploads: createSupabaseGoalImageUploadRepository(client),
  };
}

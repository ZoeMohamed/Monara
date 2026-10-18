import { createChatHistoryService, createSupabaseChatHistoryRepository } from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";

/** Builds the chat history service from server-only configuration; a missing key fails closed. */
export function chatHistoryService() {
  return createChatHistoryService(
    createSupabaseChatHistoryRepository(
      createMonaraServiceRoleClient(publicSupabaseConfig(), process.env.SUPABASE_SERVICE_ROLE_KEY),
    ),
  );
}

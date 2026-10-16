import { createSupabaseWhatsAppLinkRepository, createWhatsAppLinkService } from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";

/**
 * Builds the WhatsApp Link service from server-only configuration. A missing
 * link secret makes every call fail closed with DEPENDENCY_UNAVAILABLE.
 */
export function whatsAppLinkService() {
  return createWhatsAppLinkService({
    repository: createSupabaseWhatsAppLinkRepository(
      createMonaraServiceRoleClient(publicSupabaseConfig(), process.env.SUPABASE_SERVICE_ROLE_KEY),
    ),
    secret: process.env.WHATSAPP_LINK_SECRET,
    monaraNumber: process.env.MONARA_WHATSAPP_NUMBER,
  });
}

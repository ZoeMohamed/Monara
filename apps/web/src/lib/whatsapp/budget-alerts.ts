import {
  BUDGET_ALERT_TEMPLATE,
  createBudgetAlertService,
  createFinanceService,
  createSupabaseBudgetAlertRepository,
  createSupabaseFinanceRepository,
  type SendBudgetAlert,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import { createKapsoTransport } from "@monara/integrations";
import { after } from "next/server";

import { publicSupabaseConfig } from "@/lib/supabase/config";

/**
 * Builds the WhatsApp budget alert service (PRD F13) from server-only
 * configuration. Without the link secret or Kapso settings nothing is sent.
 */
export function budgetAlertService() {
  const client = createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const finance = createFinanceService(createSupabaseFinanceRepository(client));
  return createBudgetAlertService({
    repository: createSupabaseBudgetAlertRepository(client),
    describe: (userId, reminderId) => finance.describeBudgetAlert(userId, reminderId),
    send: kapsoSender(),
    secret: process.env.WHATSAPP_LINK_SECRET,
  });
}

/** Sends budget_alert through Kapso, or undefined when Kapso is not configured. */
function kapsoSender(): SendBudgetAlert | undefined {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  if (!apiKey || !phoneNumberId) return undefined;
  const transport = createKapsoTransport({ apiKey, phoneNumberId });
  return ({ to, bodyParameters }) =>
    transport.sendTemplate({
      // Kapso takes the number as digits only.
      to: to.replace(/\D/g, ""),
      name: BUDGET_ALERT_TEMPLATE,
      languageCode: "en",
      bodyParameters,
    });
}

/**
 * Sends the WhatsApp alert for a new budget threshold Reminder once the
 * response has gone out, so a slow or failing send never holds up a write.
 */
export function scheduleBudgetAlert(input: { userId: string; reminderId: string }): void {
  after(async () => {
    try {
      await budgetAlertService().deliver(input.userId, input.reminderId);
    } catch {
      // The Reminder still shows in the app. A failure before a delivery row is
      // written leaves nothing sent and nothing to retry.
    }
  });
}

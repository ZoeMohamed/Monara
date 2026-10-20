import { handleBillReview } from "./bills.ts";
import { handleChatRequest } from "./conversation/index.ts";
import type { Env } from "./env.ts";
import { dispatchDailyForecast, FORECAST_CRON, handleForecastRefine } from "./forecast.ts";
import {
  consumeGmailJobs,
  consumeMerchantJobs,
  handleGmailIngestRequest,
  handleGmailSyncRequest,
  scheduleGmailDaily,
} from "./gmail/index.ts";
import { healthResponse, notFoundResponse } from "./http.ts";
import { dispatchReminders } from "./reminders.ts";
import { handleUserPurge, processUserDeletions } from "./user-deletion.ts";
import { handleKapsoWebhook } from "./whatsapp/index.ts";

export { WhatsAppConversation } from "./whatsapp/conversation.ts";

/** Matches the merchant queue's name in wrangler.jsonc. */
const MERCHANT_QUEUE = "monara-merchant-jobs";

export default {
  fetch(request: Request, env: Env, context: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/users/purge") {
      return handleUserPurge(request, env);
    }
    if (request.method === "GET" && path === "/health") {
      return healthResponse();
    }
    if (request.method === "POST" && path === "/bills/review") {
      return handleBillReview(request, env);
    }
    if (request.method === "POST" && path === "/chat") {
      return handleChatRequest(request, env);
    }
    if (request.method === "POST" && path === "/forecast/refine") {
      return handleForecastRefine(request, env);
    }
    if (request.method === "POST" && path === "/webhooks/kapso") {
      return handleKapsoWebhook(request, env);
    }
    if (request.method === "POST" && path === "/gmail/ingest") {
      return handleGmailIngestRequest(request, env, context);
    }
    if (request.method === "POST" && path === "/gmail/sync") {
      return handleGmailSyncRequest(request, env, context);
    }
    return notFoundResponse();
  },

  scheduled(controller, env) {
    if (controller.cron === "* * * * *") return processUserDeletions(env);
    if (controller.cron === "0 1 * * *") return scheduleGmailDaily(env);
    if (controller.cron === "*/15 * * * *") return dispatchReminders(env);
    if (controller.cron === FORECAST_CRON) return dispatchDailyForecast(env);
  },

  queue(batch, env) {
    return batch.queue === MERCHANT_QUEUE
      ? consumeMerchantJobs(batch, env)
      : consumeGmailJobs(batch, env);
  },
} satisfies ExportedHandler<Env>;

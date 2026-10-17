import { handleChatRequest } from "./conversation/index.ts";
import type { Env } from "./env.ts";
import {
  consumeGmailJobs,
  consumeMerchantJobs,
  handleGmailSyncRequest,
  scheduleGmailSyncs,
} from "./gmail/index.ts";
import { healthResponse, notFoundResponse } from "./http.ts";
import { handleKapsoWebhook } from "./whatsapp/index.ts";

export { WhatsAppConversation } from "./whatsapp/conversation.ts";

/** Matches the merchant queue's name in wrangler.jsonc. */
const MERCHANT_QUEUE = "monara-merchant-jobs";

export default {
  fetch(request: Request, env: Env, context: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return healthResponse();
    }
    if (request.method === "POST" && path === "/chat") {
      return handleChatRequest(request, env);
    }
    if (request.method === "POST" && path === "/webhooks/kapso") {
      return handleKapsoWebhook(request, env);
    }
    if (request.method === "POST" && path === "/gmail/sync") {
      return handleGmailSyncRequest(request, env, context);
    }
    return notFoundResponse();
  },

  scheduled(_controller, env) {
    return scheduleGmailSyncs(env);
  },

  queue(batch, env) {
    return batch.queue === MERCHANT_QUEUE
      ? consumeMerchantJobs(batch, env)
      : consumeGmailJobs(batch, env);
  },
} satisfies ExportedHandler<Env>;

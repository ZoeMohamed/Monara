import { handleChatRequest } from "./conversation/index.ts";
import type { Env } from "./env.ts";
import { consumeGmailJobs, handleGmailSyncRequest, scheduleGmailSyncs } from "./gmail/index.ts";
import { handleKapsoWebhook } from "./whatsapp/index.ts";

export { WhatsAppConversation } from "./whatsapp/conversation.ts";

export default {
  fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return Response.json({ service: "monara-agent", status: "scaffold" });
    }
    if (request.method === "POST" && path === "/chat") {
      return handleChatRequest(request, env);
    }
    if (request.method === "POST" && path === "/webhooks/kapso") {
      return handleKapsoWebhook(request, env);
    }
    if (request.method === "POST" && path === "/gmail/sync") {
      return handleGmailSyncRequest(request, env);
    }
    return Response.json({ error: "Agent workflows are not implemented yet." }, { status: 501 });
  },

  scheduled(_controller, env) {
    return scheduleGmailSyncs(env);
  },

  queue(batch, env) {
    return consumeGmailJobs(batch, env);
  },
} satisfies ExportedHandler<Env>;

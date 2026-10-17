import { DurableObject } from "cloudflare:workers";
import { createKapsoTransport } from "@monara/integrations";
import { createCallOperation } from "../conversation/backend.ts";
import { createRespond } from "../conversation/respond.ts";
import type { Env } from "../env.ts";
import { createLlmClient } from "../gmail/llm.ts";
import { readReceipt } from "./receipt.ts";
import { ConversationSession, type QueuedMessage } from "./session.ts";

/**
 * One Durable Object per User holds their WhatsApp conversation. It gives the
 * webhook somewhere durable to put a message before answering Kapso, and keeps
 * a User's messages in order. The logic lives in ConversationSession.
 */
export class WhatsAppConversation extends DurableObject<Env> {
  private session(): ConversationSession {
    const respond = createRespond(this.env);
    const apiKey = this.env.KAPSO_API_KEY;
    // The webhook checks both before queueing, so this only guards a changed deployment.
    if (!respond || !apiKey) throw new Error("The WhatsApp channel is not configured.");
    const env = this.env;
    return new ConversationSession({
      storage: this.ctx.storage,
      respond,
      // createRespond already checked the backend and model settings.
      async readReceipt(message) {
        if (!message.media) throw new Error("No photo to read.");
        return readReceipt({
          userId: message.userId,
          messageId: message.messageId,
          media: message.media,
          fetchMedia: (media) =>
            createKapsoTransport({ apiKey, phoneNumberId: message.phoneNumberId }).fetchMedia(
              media,
            ),
          llm: createLlmClient({
            baseUrl: env.LLM_BASE_URL ?? "",
            apiKey: env.LLM_API_KEY ?? "",
            model: env.LLM_MODEL ?? "",
          }),
          callOperation: createCallOperation({
            baseUrl: env.MONARA_BACKEND_URL ?? "",
            secret: env.MONARA_AGENT_BACKEND_SECRET ?? "",
          }),
          now: new Date(),
        });
      },
      now: () => Date.now(),
      async send({ to, phoneNumberId, text }) {
        await createKapsoTransport({ apiKey, phoneNumberId }).sendText({ to, text });
      },
    });
  }

  async receive(message: QueuedMessage): Promise<void> {
    await this.session().receive(message);
  }

  async alarm(): Promise<void> {
    await this.session().drain();
  }
}

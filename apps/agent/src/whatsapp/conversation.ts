import { DurableObject } from "cloudflare:workers";
import { createKapsoTransport } from "@monara/integrations";
import { createCallOperation } from "../conversation/backend.ts";
import { createRespond } from "../conversation/respond.ts";
import type { Env } from "../env.ts";
import { createLlmClient } from "../gmail/llm.ts";
import { createUserIsActive } from "../user-deletion.ts";
import { readReceipt } from "./receipt.ts";
import { ConversationSession, type QueuedMessage } from "./session.ts";

/**
 * One Durable Object per User holds their WhatsApp conversation. It gives the
 * webhook somewhere durable to put a message before answering Kapso, and keeps
 * a User's messages in order. The logic lives in ConversationSession.
 */
export class WhatsAppConversation extends DurableObject<Env> {
  private purging = false;
  private readonly running = new Set<Promise<void>>();

  private async track(operation: () => Promise<void>): Promise<void> {
    if (this.purging) return;
    const promise = operation();
    this.running.add(promise);
    try {
      await promise;
    } finally {
      this.running.delete(promise);
    }
  }

  private session(): ConversationSession {
    const respond = createRespond(this.env);
    const apiKey = this.env.KAPSO_API_KEY;
    // The webhook checks both before queueing, so this only guards a changed deployment.
    if (!respond || !apiKey) throw new Error("The WhatsApp channel is not configured.");
    const env = this.env;
    return new ConversationSession({
      storage: this.ctx.storage,
      isActive: async (userId) =>
        !this.purging && (await createUserIsActive(this.env)(userId)) && !this.purging,
      respond,
      // createRespond already checked the backend and model settings.
      async readReceipt(message) {
        if (!message.media) throw new Error("No photo to read.");
        const requireActive = async () => {
          if (!(await createUserIsActive(env)(message.userId)))
            throw new Error("This account is unavailable.");
        };
        const llm = createLlmClient({
          baseUrl: env.LLM_BASE_URL ?? "",
          apiKey: env.LLM_API_KEY ?? "",
          model: env.LLM_MODEL ?? "",
          reasoningEffort: env.LLM_REASONING_EFFORT,
        });
        return readReceipt({
          userId: message.userId,
          messageId: message.messageId,
          media: message.media,
          fetchMedia: async (media) => {
            await requireActive();
            return createKapsoTransport({
              apiKey,
              phoneNumberId: message.phoneNumberId,
            }).fetchMedia(media);
          },
          llm: {
            completeJson: async (request) => {
              await requireActive();
              return llm.completeJson(request, requireActive);
            },
          },
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
    await this.track(() => this.session().receive(message));
  }

  async alarm(): Promise<void> {
    await this.track(() => this.session().drain());
  }

  /** Drain old invocations before erasing, so a late model reply cannot restore state. */
  async purge(): Promise<void> {
    this.purging = true;
    await Promise.allSettled([...this.running]);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

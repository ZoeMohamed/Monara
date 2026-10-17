import {
  type ResolveWhatsAppSenderResult,
  resolveWhatsAppSenderInputSchema,
  type WhatsAppCodeRejection,
} from "@monara/contracts";
import {
  createKapsoTransport,
  KAPSO_MESSAGE_RECEIVED_EVENT,
  type KapsoInboundMessage,
  parseKapsoInboundMessages,
  verifyKapsoSignature,
} from "@monara/integrations";
import { createResolveSender, type ResolveSender } from "../conversation/backend.ts";
import { createRespond } from "../conversation/respond.ts";
import type { Env } from "../env.ts";
import type { QueuedMessage } from "./session.ts";

const LINK_PROMPT =
  "This WhatsApp number isn't linked to a Monara account yet. Open Monara, go to Settings, and link your WhatsApp number to chat with your Agent here.";
const LINKED_REPLY =
  "Your WhatsApp number is now linked to Monara. You can message me here to log spending, check your budgets, and see what's coming up.";
const CODE_REPLIES: Record<WhatsAppCodeRejection, string> = {
  incorrect: "That code isn't right. Check the code in Monara under Settings and send it again.",
  expired: "That code has expired. Open Monara, go to Settings, and get a new one.",
  too_many_attempts: "Too many wrong codes. Open Monara, go to Settings, and start linking again.",
};
// Receipt photos go to the User's conversation (receipt.ts); voice notes are not read yet.
const MEDIA_REPLY =
  "I can't listen to voice notes yet. Send a photo of the receipt or type it, for example: lunch 20k from GoPay.";
const TEXT_ONLY_REPLY = "I can only read text messages for now.";

/** What the handler needs from outside, so it can be tested without Kapso or a backend. */
export interface WebhookDependencies {
  webhookSecret: string;
  resolveSender: ResolveSender;
  sendText(input: { to: string; phoneNumberId: string; text: string }): Promise<void>;
  /** Hands a linked User's message to their conversation and returns without waiting for a reply. */
  enqueue(message: QueuedMessage): Promise<void>;
}

/** Decides the fixed reply for a sender, or null when the message goes to the Agent. */
function fixedReply(
  resolution: ResolveWhatsAppSenderResult,
  message: KapsoInboundMessage,
): string | null {
  if (resolution.status === "unlinked") return LINK_PROMPT;
  if (resolution.status === "code_rejected") return CODE_REPLIES[resolution.reason];
  if (resolution.status === "verified") return LINKED_REPLY;
  if (message.media) return message.type === "image" ? null : MEDIA_REPLY;
  return message.text?.trim() ? null : TEXT_ONLY_REPLY;
}

/**
 * Kapso webhook for inbound WhatsApp messages (F12).
 *
 * A sender's number is only a claim. The backend decides whether it belongs to
 * a verified WhatsApp Link, and only then does the message reach the Agent as
 * that User. Everyone else gets a fixed reply and no data.
 */
export async function handleInbound(
  request: Request,
  dependencies: WebhookDependencies,
): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Webhook-Signature");
  if (!(await verifyKapsoSignature({ rawBody, signature, secret: dependencies.webhookSecret }))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (request.headers.get("X-Webhook-Event") !== KAPSO_MESSAGE_RECEIVED_EVENT) {
    return Response.json({ ok: true, handled: 0 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // One fixed reply per sender, however many messages Kapso buffered into this delivery.
  const replied = new Set<string>();
  let handled = 0;
  try {
    for (const message of parseKapsoInboundMessages(payload)) {
      const text = message.text?.trim() ?? "";
      const sender = resolveWhatsAppSenderInputSchema.safeParse({
        phoneE164: `+${message.from}`,
        // The backend only ever sees a message that is nothing but a code.
        verificationCode: /^\d{6}$/.test(text) ? text : null,
      });
      if (!sender.success) continue;
      const resolution = await dependencies.resolveSender(sender.data);
      const reply = fixedReply(resolution, message);
      handled += 1;
      if (reply === null && resolution.status === "linked") {
        await dependencies.enqueue({
          userId: resolution.userId,
          messageId: message.messageId,
          text: text.slice(0, 4000),
          ...(message.media && message.type === "image" ? { media: message.media } : {}),
          to: message.from,
          phoneNumberId: message.phoneNumberId,
        });
      } else if (reply !== null && !replied.has(`${message.from}|${reply}`)) {
        replied.add(`${message.from}|${reply}`);
        await dependencies.sendText({
          to: message.from,
          phoneNumberId: message.phoneNumberId,
          text: reply,
        });
      }
    }
  } catch {
    // A non-200 makes Kapso redeliver. Messages already queued are recognised by their id.
    return Response.json({ error: "The message could not be handled." }, { status: 502 });
  }
  return Response.json({ ok: true, handled });
}

export async function handleKapsoWebhook(request: Request, env: Env): Promise<Response> {
  const { KAPSO_API_KEY, KAPSO_WEBHOOK_SECRET, MONARA_BACKEND_URL, MONARA_AGENT_BACKEND_SECRET } =
    env;
  const conversations = env.CONVERSATIONS;
  if (
    !KAPSO_API_KEY ||
    !KAPSO_WEBHOOK_SECRET ||
    !MONARA_BACKEND_URL ||
    !MONARA_AGENT_BACKEND_SECRET ||
    !conversations ||
    !createRespond(env)
  ) {
    return Response.json({ error: "The WhatsApp channel is not configured." }, { status: 503 });
  }

  return handleInbound(request, {
    webhookSecret: KAPSO_WEBHOOK_SECRET,
    resolveSender: createResolveSender({
      baseUrl: MONARA_BACKEND_URL,
      secret: MONARA_AGENT_BACKEND_SECRET,
    }),
    async sendText({ to, phoneNumberId, text }) {
      await createKapsoTransport({ apiKey: KAPSO_API_KEY, phoneNumberId }).sendText({ to, text });
    },
    async enqueue(message) {
      await conversations.get(conversations.idFromName(message.userId)).receive(message);
    },
  });
}

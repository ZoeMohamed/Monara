// Kapso WhatsApp adapter. It only moves messages: resolve the WhatsApp Link to a
// User before treating a sender as anyone, and verify every webhook before parsing it.
import { z } from "zod";

export interface WhatsAppTransport {
  /** Sends a text message to a WhatsApp number given in international format, digits only. */
  sendText(input: { to: string; text: string }): Promise<{ messageId: string }>;
}

export interface KapsoInboundMessage {
  messageId: string;
  /** Sender's WhatsApp number, digits only. Not proof of identity. */
  from: string;
  /** The business number that received the message; replies go out through it. */
  phoneNumberId: string;
  type: string;
  /** Null for anything that is not a text message. */
  text: string | null;
}

export const KAPSO_MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";

const KAPSO_API_BASE_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";
// WhatsApp rejects text bodies longer than 4096 characters.
const MAX_TEXT_LENGTH = 4000;

const encoder = new TextEncoder();

/**
 * Kapso signs the raw request body with HMAC-SHA256 and sends the hex digest in
 * `X-Webhook-Signature`. Pass the body exactly as received, before any JSON parsing.
 */
export async function verifyKapsoSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): Promise<boolean> {
  const signature = input.signature?.trim() ?? "";
  if (!input.secret || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(signature.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(input.rawBody));
}

const messageEventSchema = z.object({
  message: z.object({
    id: z.string().min(1),
    type: z.string().optional(),
    from: z.string().optional(),
    text: z.object({ body: z.string().optional() }).optional(),
    kapso: z.object({ direction: z.string().optional() }).optional(),
  }),
  conversation: z
    .object({ phone_number: z.string().optional(), phone_number_id: z.string().optional() })
    .optional(),
  phone_number_id: z.string().optional(),
});

// With buffering enabled Kapso delivers several events in one envelope.
const batchSchema = z.object({ batch: z.literal(true), data: z.array(z.unknown()) });

/**
 * Reads the inbound messages out of a verified `whatsapp.message.received` body.
 * Events that are malformed, outbound, or missing a sender are skipped.
 */
export function parseKapsoInboundMessages(payload: unknown): KapsoInboundMessage[] {
  const batch = batchSchema.safeParse(payload);
  const events = batch.success ? batch.data.data : [payload];
  const messages: KapsoInboundMessage[] = [];
  for (const event of events) {
    const parsed = messageEventSchema.safeParse(event);
    if (!parsed.success) continue;
    const { message, conversation, phone_number_id } = parsed.data;
    if (message.kapso?.direction === "outbound") continue;
    const from = (message.from ?? conversation?.phone_number ?? "").replace(/\D/g, "");
    const phoneNumberId = phone_number_id ?? conversation?.phone_number_id;
    if (!from || !phoneNumberId) continue;
    const type = message.type ?? "unknown";
    messages.push({
      messageId: message.id,
      from,
      phoneNumberId,
      type,
      text: type === "text" ? (message.text?.body ?? null) : null,
    });
  }
  return messages;
}

const sendResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
});

function splitText(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_TEXT_LENGTH) {
    const lineBreak = rest.lastIndexOf("\n", MAX_TEXT_LENGTH);
    const cut = lineBreak > MAX_TEXT_LENGTH / 2 ? lineBreak : MAX_TEXT_LENGTH;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function createKapsoTransport(config: {
  apiKey: string;
  phoneNumberId: string;
  baseUrl?: string;
}): WhatsAppTransport {
  const url = `${config.baseUrl ?? KAPSO_API_BASE_URL}/${config.phoneNumberId}/messages`;

  async function send(to: string, body: string): Promise<string> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-API-Key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!response.ok) {
      // The response body can echo the recipient or the message, so keep it out of the error.
      throw new Error(`Kapso rejected the message with status ${response.status}.`);
    }
    const parsed = sendResponseSchema.safeParse(await response.json());
    const messageId = parsed.success ? parsed.data.messages[0]?.id : undefined;
    if (!messageId) throw new Error("Kapso accepted the message but returned no message id.");
    return messageId;
  }

  return {
    async sendText({ to, text }) {
      const chunks = splitText(text);
      if (chunks.length === 0) throw new Error("Cannot send an empty WhatsApp message.");
      let messageId = "";
      for (const chunk of chunks) {
        messageId = await send(to, chunk);
      }
      return { messageId };
    },
  };
}

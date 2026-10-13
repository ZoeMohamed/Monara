// Kapso WhatsApp adapter. It only moves messages: resolve the WhatsApp Link to a
// User before treating a sender as anyone, and verify every webhook before parsing it.
import { z } from "zod";

export interface WhatsAppTransport {
  /**
   * Sends a text message to a WhatsApp number given in international format, digits only.
   * WhatsApp only delivers it within 24 hours of the recipient's last message.
   */
  sendText(input: { to: string; text: string }): Promise<{ messageId: string }>;
  /**
   * Sends an approved template, which is the only message WhatsApp delivers
   * outside the 24-hour window. Parameters fill {{1}}, {{2}}, ... in order.
   */
  sendTemplate(input: {
    to: string;
    name: string;
    languageCode: string;
    bodyParameters: string[];
  }): Promise<{ messageId: string }>;
  /**
   * Downloads a photo or voice note for extraction. The bytes are returned to
   * the caller and kept nowhere else; do not store them after extraction.
   */
  fetchMedia(media: KapsoInboundMedia): Promise<{ bytes: ArrayBuffer; contentType: string }>;
}

export interface KapsoInboundMedia {
  url: string;
  contentType: string;
  byteSize: number | null;
  /** Text the sender typed under a photo. Data to read, never instructions. */
  caption: string | null;
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
  /** Set for a photo (`image`) or voice note (`audio`) that Kapso has stored. */
  media: KapsoInboundMedia | null;
}

export const KAPSO_MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";

const KAPSO_API_BASE_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";
// Media is only ever fetched from Kapso, so the API key cannot be sent anywhere else.
const KAPSO_MEDIA_ORIGIN = "https://api.kapso.ai";
// A stalled send would hold up the webhook's answer to Kapso and a User's whole queue.
const SEND_TIMEOUT_MS = 10_000;
const MEDIA_TIMEOUT_MS = 30_000;
// WhatsApp caps images at 5 MB and audio at 16 MB.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
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
    image: z.object({ caption: z.string().optional() }).optional(),
    kapso: z
      .object({
        direction: z.string().optional(),
        media_data: z
          .object({
            url: z.string().optional(),
            content_type: z.string().optional(),
            byte_size: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
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
    const stored = message.kapso?.media_data;
    const hasMedia = (type === "image" || type === "audio") && stored?.url && stored.content_type;
    messages.push({
      messageId: message.id,
      from,
      phoneNumberId,
      type,
      text: type === "text" ? (message.text?.body ?? null) : null,
      media: hasMedia
        ? {
            url: stored.url ?? "",
            contentType: stored.content_type ?? "",
            byteSize: stored.byte_size ?? null,
            caption: message.image?.caption?.trim() || null,
          }
        : null,
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

  async function send(to: string, message: Record<string, unknown>): Promise<string> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-API-Key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
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
        messageId = await send(to, { type: "text", text: { body: chunk } });
      }
      return { messageId };
    },
    async sendTemplate({ to, name, languageCode, bodyParameters }) {
      const parameters = bodyParameters.map((text) => ({ type: "text", text }));
      const messageId = await send(to, {
        type: "template",
        template: {
          name,
          language: { code: languageCode },
          components: parameters.length > 0 ? [{ type: "body", parameters }] : [],
        },
      });
      return { messageId };
    },
    async fetchMedia(media) {
      let origin = "";
      try {
        origin = new URL(media.url).origin;
      } catch {
        // Falls through to the origin check.
      }
      if (origin !== KAPSO_MEDIA_ORIGIN) throw new Error("Media is not hosted by Kapso.");
      if (media.byteSize !== null && media.byteSize > MAX_MEDIA_BYTES) {
        throw new Error("Media is too large.");
      }
      // A redirect could carry the API key to another host.
      const response = await fetch(media.url, {
        headers: { "X-API-Key": config.apiKey },
        redirect: "error",
        signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(`Kapso media request failed with status ${response.status}.`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Media is too large.");
      return { bytes, contentType: media.contentType };
    },
  };
}

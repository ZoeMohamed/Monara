import { z } from "zod";
import { agentChatResponseSchema } from "./channels.ts";
import {
  chatHistoryMaxBytes,
  chatReplyMaxActions,
  chatReplyMaxCharacters,
  chatStorageByteLength,
} from "./chat-limits.ts";
import { isoDateTimeSchema } from "./common.ts";

export const chatReceiptMaxBytes = 10 * 1024 * 1024;

export const chatReceiptAttachmentSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    sizeBytes: z.number().int().positive().max(chatReceiptMaxBytes),
  })
  .strict();

/** The future upload endpoint must also verify image bytes and the authenticated owner. */
export const chatReceiptRequestSchema = z
  .object({
    attachment: chatReceiptAttachmentSchema,
    text: z.string().trim().max(4_000).default(""),
    // A photo without text means import a transaction; it never means invent missing details.
    intent: z.literal("import_transaction").default("import_transaction"),
  })
  .strict();

/** Private Storage URL shape. Renderers must also match the configured Supabase origin. */
export const chatVisualAttachmentSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("spending_visualization"),
    source: z.literal("supabase_storage"),
    title: z.string().trim().min(1).max(120),
    alt: z.string().trim().min(1).max(500),
    url: z
      .url({ protocol: /^https$/, normalize: true })
      .max(16_000)
      .regex(
        /^https:\/\/[^/?#@\s]+\/storage\/v1\/object\/sign\/[^?#\s]+\?(?:[^#\s]*&)?token=[A-Za-z0-9._~-]+(?:&[^#\s]*)?$/,
        "A private, signed Supabase Storage URL is required.",
      ),
    expiresAt: isoDateTimeSchema,
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
  })
  .strict();

/** Optional response extension; no storage or generation capability is implied by this shape. */
export const webChatResponseSchema = agentChatResponseSchema
  .extend({
    reply: z.string().trim().min(1).max(chatReplyMaxCharacters),
    actions: agentChatResponseSchema.shape.actions.max(chatReplyMaxActions),
    visuals: z.array(chatVisualAttachmentSchema).max(4).optional(),
  })
  .refine(
    (response) =>
      chatStorageByteLength({
        text: response.reply,
        result: { ...response, confirmation: null },
      }) <=
      chatHistoryMaxBytes - 4_096,
    "This reply is too large to retain safely in chat history.",
  );

export type ChatReceiptAttachment = z.infer<typeof chatReceiptAttachmentSchema>;
export type ChatReceiptRequest = z.infer<typeof chatReceiptRequestSchema>;
export type ChatVisualAttachment = z.infer<typeof chatVisualAttachmentSchema>;
export type WebChatResponse = z.infer<typeof webChatResponseSchema>;

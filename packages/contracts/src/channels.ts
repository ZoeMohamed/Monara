import { z } from "zod";
import { userIdSchema } from "./common.ts";

// Construct this only after resolving a verified WhatsApp Link on the server.
export const whatsAppMessageSchema = z
  .object({
    userId: userIdSchema,
    messageId: z.string().min(1).max(500),
    text: z.string().min(1).max(4_000),
  })
  .strict();

export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

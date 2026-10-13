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

// In-app chat. The web backend resolves userId from the signed-in session before
// calling the agent runtime; the agent never accepts it from a browser.
export const agentChatRequestSchema = z
  .object({
    userId: userIdSchema,
    text: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const agentChatResponseSchema = z
  .object({
    reply: z.string().min(1),
  })
  .strict();

export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export type AgentChatResponse = z.infer<typeof agentChatResponseSchema>;

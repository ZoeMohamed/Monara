import { z } from "zod";
import { reversibleActionReceiptSchema, userIdSchema } from "./common.ts";

// Construct this only after resolving a verified WhatsApp Link on the server.
export const whatsAppMessageSchema = z
  .object({
    userId: userIdSchema,
    messageId: z.string().min(1).max(500),
    text: z.string().min(1).max(4_000),
  })
  .strict();

export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

// One earlier message in a chat. An Agent turn carries the receipts of what it
// changed, so a later "undo" or "no, 38k" can refer to them.
export const agentChatTurnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1).max(4_000),
    actions: z.array(reversibleActionReceiptSchema).max(20).optional(),
  })
  .strict();

// In-app chat. The web backend resolves userId from the signed-in session before
// calling the agent runtime; the agent never accepts it from a browser. The Agent
// stores no conversation, so the caller sends the earlier turns each time.
export const agentChatRequestSchema = z
  .object({
    userId: userIdSchema,
    text: z.string().trim().min(1).max(4_000),
    history: z.array(agentChatTurnSchema).max(40).default([]),
  })
  .strict();

export const agentChatResponseSchema = z
  .object({
    reply: z.string().min(1),
    actions: z.array(reversibleActionReceiptSchema),
  })
  .strict();

export type AgentChatTurn = z.infer<typeof agentChatTurnSchema>;
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export type AgentChatResponse = z.infer<typeof agentChatResponseSchema>;

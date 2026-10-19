import { z } from "zod";
import { agentChatRequestSchema, agentChatResponseSchema } from "./channels.ts";
import { chatHistoryMaxBytes, chatStorageByteLength } from "./chat-limits.ts";
import { webChatResponseSchema } from "./chat-media.ts";
import { isoDateTimeSchema } from "./common.ts";

export const savedChatListLimit = 50;
export const savedChatMessageLimit = 200;

/**
 * The browser names the conversation; the server decides whose it is. A first message
 * creates it, and an id that belongs to another User is refused, never adopted.
 */
export const webChatRequestSchema = agentChatRequestSchema
  .omit({ userId: true })
  .extend({ conversationId: z.uuid(), historyRecovery: z.literal(true).optional() })
  .strict();

export const savedChatMessageSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(["user", "agent"]),
    text: z.string().min(1).max(20_000),
    // Receipts of what the Agent changed. Never an open confirmation or a signed image link.
    result: agentChatResponseSchema.extend({ confirmation: z.null() }).nullable(),
    // The Agent asked for a confirmation that was never answered, so it is shown as closed.
    closedConfirmation: z.boolean(),
  })
  .strict();

export const savedChatConversationSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(80),
    updatedAt: isoDateTimeSchema,
    messageCount: z.number().int().min(0),
  })
  .strict();

export const savedChatListSchema = z
  .object({ conversations: z.array(savedChatConversationSchema).max(savedChatListLimit) })
  .strict();

export const savedChatMessagesSchema = z
  .object({ messages: z.array(savedChatMessageSchema).max(savedChatMessageLimit) })
  .strict();

export type WebChatRequest = z.infer<typeof webChatRequestSchema>;
export type SavedChatMessage = z.infer<typeof savedChatMessageSchema>;
export type SavedChatConversation = z.infer<typeof savedChatConversationSchema>;
export type SavedChatList = z.infer<typeof savedChatListSchema>;
export type SavedChatMessages = z.infer<typeof savedChatMessagesSchema>;

/** A server-verified exchange. Retry saves this exchange, never calls the Agent again. */
export const chatExchangeSchema = z
  .object({
    exchangeId: z.uuid(),
    createdAt: isoDateTimeSchema,
    conversationId: z.uuid(),
    text: agentChatRequestSchema.shape.text,
    response: webChatResponseSchema,
  })
  .strict()
  .refine(
    (exchange) => chatStorageByteLength(exchange) <= chatHistoryMaxBytes,
    "This chat exchange is too large to save safely.",
  );

export const chatHistorySaveStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), exchangeId: z.uuid() }).strict(),
  z
    .object({
      status: z.literal("pending"),
      exchangeId: z.uuid(),
      recoveryToken: z.string().min(1).max(200_000),
      expiresAt: isoDateTimeSchema,
    })
    .strict(),
]);

/** Persistence status is mandatory on the web bridge, never supplied by the Agent. */
export const webChatBridgeResponseSchema = webChatResponseSchema.safeExtend({
  historySave: chatHistorySaveStatusSchema,
});

export const retryChatHistorySchema = z
  .object({
    recoveryToken: z.string().min(1).max(200_000),
  })
  .strict();

export type ChatExchange = z.infer<typeof chatExchangeSchema>;
export type ChatHistorySaveStatus = z.infer<typeof chatHistorySaveStatusSchema>;
export type WebChatBridgeResponse = z.infer<typeof webChatBridgeResponseSchema>;

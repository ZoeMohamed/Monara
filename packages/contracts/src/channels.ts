import { z } from "zod";
import {
  destructiveActionConfirmationSchema,
  destructiveActionSchema,
  reversibleActionReceiptSchema,
  userIdSchema,
} from "./common.ts";

// Construct this only after resolving a verified WhatsApp Link on the server.
export const whatsAppMessageSchema = z
  .object({
    userId: userIdSchema,
    messageId: z.string().min(1).max(500),
    text: z.string().min(1).max(4_000),
  })
  .strict();

export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

export const phoneE164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Phone must be E.164.");
export const whatsAppVerificationCodeSchema = z.string().regex(/^\d{6}$/);

// What the Agent asks the backend about each WhatsApp sender. The number is a
// claim until the backend finds a verified WhatsApp Link for it. A code is sent
// only when the whole message is one, so no conversation reaches this call.
export const resolveWhatsAppSenderInputSchema = z
  .object({
    phoneE164: phoneE164Schema,
    verificationCode: whatsAppVerificationCodeSchema.nullable(),
  })
  .strict();

export const whatsAppCodeRejectionSchema = z.enum(["incorrect", "expired", "too_many_attempts"]);

export const resolveWhatsAppSenderResultSchema = z.discriminatedUnion("status", [
  // A verified link exists: messages from this number belong to this User.
  z.object({ status: z.literal("linked"), userId: userIdSchema }).strict(),
  // The code matched a pending link, which is now verified.
  z.object({ status: z.literal("verified"), userId: userIdSchema }).strict(),
  z.object({ status: z.literal("code_rejected"), reason: whatsAppCodeRejectionSchema }).strict(),
  z.object({ status: z.literal("unlinked") }).strict(),
]);

export type ResolveWhatsAppSenderInput = z.input<typeof resolveWhatsAppSenderInputSchema>;
export type WhatsAppCodeRejection = z.infer<typeof whatsAppCodeRejectionSchema>;
export type ResolveWhatsAppSenderResult = z.infer<typeof resolveWhatsAppSenderResultSchema>;

// One earlier message in a chat. An Agent turn carries the receipts of what it
// changed, so a later "undo" or "no, 38k" can refer to them, and the destructive
// action it asked the User to confirm, if any.
export const agentChatTurnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1).max(4_000),
    actions: z.array(reversibleActionReceiptSchema).max(20).optional(),
    confirmation: destructiveActionConfirmationSchema.optional(),
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
    // Set when the reply asks the User to confirm a destructive action. The caller
    // stores it on this turn; the User's next message must be "yes" to carry it out.
    confirmation: destructiveActionConfirmationSchema.nullable(),
  })
  .strict();

// The Agent never deletes directly. It asks the backend for a confirmation bound
// to this one action, then answers it only with the User's own "yes".
export const requestDestructiveActionInputSchema = z
  .object({
    action: destructiveActionSchema,
    input: z.unknown(),
  })
  .strict();

export type AgentChatTurn = z.infer<typeof agentChatTurnSchema>;
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export type AgentChatResponse = z.infer<typeof agentChatResponseSchema>;
export type RequestDestructiveActionInput = z.input<typeof requestDestructiveActionInputSchema>;

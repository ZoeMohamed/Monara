import { z } from "zod";

export const userIdSchema = z.uuid();
export const financialAccountIdSchema = z.uuid();
export const transactionReviewStatusSchema = z.enum(["pending", "confirmed"]);

export const gmailExtractionJobSchema = z.object({
  kind: z.literal("gmail.extract"),
  userId: userIdSchema,
  connectionId: z.string().min(1),
  messageId: z.string().min(1),
});

// Identity must be resolved from a verified channel link before this is constructed.
export const whatsAppMessageSchema = z.object({
  userId: userIdSchema,
  messageId: z.string().min(1),
  text: z.string().min(1),
});

export type UserId = z.infer<typeof userIdSchema>;
export type FinancialAccountId = z.infer<typeof financialAccountIdSchema>;
export type TransactionReviewStatus = z.infer<typeof transactionReviewStatusSchema>;
export type GmailExtractionJob = z.infer<typeof gmailExtractionJobSchema>;
export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

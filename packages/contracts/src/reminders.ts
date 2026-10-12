import { z } from "zod";
import {
  budgetIdSchema,
  isoDateTimeSchema,
  paginationInputSchema,
  recurringBillIdSchema,
  reminderIdSchema,
  reversibleActionReceiptSchema,
} from "./common.ts";

export const reminderStatusSchema = z.enum(["unread", "read", "dismissed"]);

const reminderBaseShape = {
  id: reminderIdSchema,
  status: reminderStatusSchema,
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1_000),
  dedupeKey: z.string().min(1).max(300),
  scheduledFor: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
} as const;

function validateReadState(
  value: { status: z.infer<typeof reminderStatusSchema>; readAt: string | null },
  context: z.RefinementCtx,
): void {
  if (value.status === "read" && value.readAt === null) {
    context.addIssue({
      code: "custom",
      path: ["readAt"],
      message: "Read Reminders need a read timestamp.",
    });
  }
  if (value.status === "unread" && value.readAt !== null) {
    context.addIssue({
      code: "custom",
      path: ["readAt"],
      message: "Unread Reminders cannot have a read timestamp.",
    });
  }
}

export const budgetThresholdReminderSchema = z
  .object({
    ...reminderBaseShape,
    kind: z.literal("budget_threshold"),
    budgetId: budgetIdSchema,
    thresholdPercent: z.number().int().min(1).max(100),
  })
  .strict()
  .superRefine(validateReadState);

export const billDueReminderSchema = z
  .object({
    ...reminderBaseShape,
    kind: z.literal("bill_due"),
    recurringBillId: recurringBillIdSchema,
    offsetDays: z.number().int().min(0).max(365),
  })
  .strict()
  .superRefine(validateReadState);

export const reminderSchema = z.discriminatedUnion("kind", [
  budgetThresholdReminderSchema,
  billDueReminderSchema,
]);

export const reminderKindSchema = z.enum(["budget_threshold", "bill_due"]);

export const listRemindersInputSchema = paginationInputSchema
  .extend({
    kind: reminderKindSchema.optional(),
    status: reminderStatusSchema.optional(),
  })
  .strict();

export const markReminderReadInputSchema = z
  .object({
    reminderId: reminderIdSchema,
    expectedStatus: z.enum(["unread", "read"]),
  })
  .strict();

export const dismissReminderInputSchema = z
  .object({
    reminderId: reminderIdSchema,
    expectedStatus: reminderStatusSchema,
  })
  .strict();

export const reminderPageSchema = z
  .object({
    items: z.array(reminderSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const reminderDeliveryStatusSchema = z.enum(["queued", "sent", "skipped", "failed"]);

export const reminderDeliverySchema = z
  .object({
    reminderId: reminderIdSchema,
    channel: z.literal("whatsapp"),
    status: reminderDeliveryStatusSchema,
    templateName: z.enum(["budget_alert", "bill_due"]).nullable(),
    attemptedAt: isoDateTimeSchema.nullable(),
    sentAt: isoDateTimeSchema.nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
  })
  .strict();

export const reminderPreferencesSchema = z
  .object({
    whatsAppEnabled: z.boolean(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const setReminderPreferencesInputSchema = z
  .object({
    whatsAppEnabled: z.boolean(),
    expectedUpdatedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const reminderPreferencesMutationResultSchema = z
  .object({
    preferences: reminderPreferencesSchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type BudgetThresholdReminder = z.infer<typeof budgetThresholdReminderSchema>;
export type BillDueReminder = z.infer<typeof billDueReminderSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderKind = z.infer<typeof reminderKindSchema>;
export type ListRemindersInput = z.input<typeof listRemindersInputSchema>;
export type MarkReminderReadInput = z.input<typeof markReminderReadInputSchema>;
export type DismissReminderInput = z.input<typeof dismissReminderInputSchema>;
export type ReminderPage = z.infer<typeof reminderPageSchema>;
export type ReminderDeliveryStatus = z.infer<typeof reminderDeliveryStatusSchema>;
export type ReminderDelivery = z.infer<typeof reminderDeliverySchema>;
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema>;
export type SetReminderPreferencesInput = z.input<typeof setReminderPreferencesInputSchema>;
export type ReminderPreferencesMutationResult = z.infer<
  typeof reminderPreferencesMutationResultSchema
>;

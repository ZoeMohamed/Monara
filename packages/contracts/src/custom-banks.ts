import { z } from "zod";
import { clientRequestIdSchema, gmailConnectionIdSchema, isoDateTimeSchema } from "./common.ts";
import {
  bankLogoSchema,
  customInstitutionKeySchema,
  findInstitutionBySender,
  type Institution,
  institutionPlatformSchema,
  storedBankLogoSchema,
} from "./institutions.ts";
import { financialAccountSchema } from "./ledger.ts";

const senderSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid sender email." }).max(320));
const senderEmailsSchema = z
  .array(senderSchema)
  .min(1)
  .max(20)
  .superRefine((senders, context) => {
    const seen = new Set<string>();
    for (const [index, sender] of senders.entries()) {
      const message = findInstitutionBySender(sender)
        ? "This bank is already listed in Monara. Choose it from the list."
        : seen.has(sender)
          ? "This email is listed more than once."
          : null;
      if (message) context.addIssue({ code: "custom", path: [index], message });
      seen.add(sender);
    }
  });

const bankFields = {
  name: z.string().trim().min(1, "Enter a bank name.").max(100, "Use 100 characters or fewer."),
  platform: institutionPlatformSchema,
  senderEmails: senderEmailsSchema,
  logo: bankLogoSchema.nullable(),
};

export const customBankSchema = z
  .object({
    id: z.uuid(),
    key: customInstitutionKeySchema,
    ...bankFields,
    // An app catalog update must not make a previously saved bank unreadable.
    senderEmails: z.array(senderSchema).min(1).max(20),
    logo: storedBankLogoSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const customBankListSchema = z.array(customBankSchema).max(100);
export const listCustomBanksInputSchema = z.object({}).strict();

export const createCustomBankInputSchema = z
  .object({
    bankId: z.uuid(),
    clientRequestId: clientRequestIdSchema,
    ...bankFields,
    accountName: z.string().trim().min(1, "Enter an account name.").max(100),
    lastFour: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    gmailConnectionId: gmailConnectionIdSchema.nullable(),
  })
  .strict();

export const updateCustomBankInputSchema = z
  .object({
    bankId: z.uuid(),
    expectedUpdatedAt: isoDateTimeSchema,
    name: bankFields.name,
    senderEmails: bankFields.senderEmails,
    logo: bankFields.logo,
  })
  .strict();

export const createCustomBankResultSchema = z
  .object({
    customBank: customBankSchema,
    financialAccount: financialAccountSchema,
  })
  .strict();

export const updateCustomBankResultSchema = z
  .object({
    customBank: customBankSchema,
    sendersChanged: z.boolean(),
  })
  .strict();

export type CustomBank = z.infer<typeof customBankSchema>;
export type CreateCustomBankInput = z.infer<typeof createCustomBankInputSchema>;
export type CreateCustomBankResult = z.infer<typeof createCustomBankResultSchema>;
export type UpdateCustomBankInput = z.infer<typeof updateCustomBankInputSchema>;

export function customBankInstitution(
  bank: Pick<CustomBank, "key" | "name" | "platform" | "senderEmails">,
): Institution {
  return {
    key: bank.key,
    name: bank.name,
    provider: bank.name,
    platform: bank.platform,
    senderEmails: bank.senderEmails,
  };
}

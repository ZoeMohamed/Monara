import { z } from "zod";
import {
  categoryIdSchema,
  clientRequestIdSchema,
  currencySchema,
  financialAccountIdSchema,
  gmailConnectionIdSchema,
  isoDateTimeSchema,
  paginationInputSchema,
  reversibleActionReceiptSchema,
} from "./common.ts";
import { institutionKeySchema } from "./institutions.ts";

export const financialAccountTypeSchema = z.enum(["bank", "wallet", "cash"]);

const financialAccountValuesShape = {
  name: z.string().trim().min(1).max(100),
  institution: z.string().trim().min(1).max(150).nullable(),
  accountType: financialAccountTypeSchema,
  currency: currencySchema,
  lastFour: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
} as const;

/**
 * The registry entry (packages/contracts/src/institutions) this account belongs to.
 * Gmail imports from that entry's senders are mapped to the account.
 */
const institutionKeyValueSchema = institutionKeySchema.nullable();

/**
 * The one Gmail connection this account's bank emails are imported from; null for a
 * manual-only account. The server checks that it is the User's own active connection.
 */
const gmailConnectionValueSchema = gmailConnectionIdSchema.nullable();

export const financialAccountSchema = z
  .object({
    id: financialAccountIdSchema,
    ...financialAccountValuesShape,
    institutionKey: institutionKeyValueSchema,
    gmailConnectionId: gmailConnectionValueSchema.default(null),
    isActive: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const createFinancialAccountInputSchema = z
  .object({
    ...financialAccountValuesShape,
    institutionKey: institutionKeyValueSchema.default(null),
    gmailConnectionId: gmailConnectionValueSchema.default(null),
    clientRequestId: clientRequestIdSchema,
  })
  .strict();

export const updateFinancialAccountInputSchema = z
  .object({
    financialAccountId: financialAccountIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: z
      .object({
        ...financialAccountValuesShape,
        institutionKey: institutionKeyValueSchema,
        gmailConnectionId: gmailConnectionValueSchema,
        isActive: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.changes).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "At least one change is required.",
      });
    }
  });

export const listFinancialAccountsInputSchema = paginationInputSchema
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const financialAccountPageSchema = z
  .object({
    items: z.array(financialAccountSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const financialAccountMutationResultSchema = z
  .object({
    financialAccount: financialAccountSchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export const categorySchema = z
  .object({
    id: categoryIdSchema,
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().min(1).max(100),
    icon: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    isDefault: z.boolean(),
    isArchived: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

// Category IDs double as client request IDs for retry-safe creation without a new table.
export const createCategoryInputSchema = z
  .object({
    name: categorySchema.shape.name,
    icon: categorySchema.shape.icon,
    color: categorySchema.shape.color,
    clientRequestId: z.uuid(),
  })
  .strict();

export const createCategoryResultSchema = z.object({ category: categorySchema }).strict();

export const updateCategoryInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        icon: z.string().trim().min(1).max(100).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
        isArchived: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.changes).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "At least one change is required.",
      });
    }
  });

export const listCategoriesInputSchema = paginationInputSchema
  .extend({ isArchived: z.boolean().optional() })
  .strict();

export const categoryPageSchema = z
  .object({
    items: z.array(categorySchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const categoryMutationResultSchema = z
  .object({
    category: categorySchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export type FinancialAccountType = z.infer<typeof financialAccountTypeSchema>;
export type FinancialAccount = z.infer<typeof financialAccountSchema>;
export type CreateFinancialAccountInput = z.input<typeof createFinancialAccountInputSchema>;
export type UpdateFinancialAccountInput = z.input<typeof updateFinancialAccountInputSchema>;
export type ListFinancialAccountsInput = z.input<typeof listFinancialAccountsInputSchema>;
export type FinancialAccountPage = z.infer<typeof financialAccountPageSchema>;
export type FinancialAccountMutationResult = z.infer<typeof financialAccountMutationResultSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.input<typeof createCategoryInputSchema>;
export type CreateCategoryResult = z.infer<typeof createCategoryResultSchema>;
export type UpdateCategoryInput = z.input<typeof updateCategoryInputSchema>;
export type ListCategoriesInput = z.input<typeof listCategoriesInputSchema>;
export type CategoryPage = z.infer<typeof categoryPageSchema>;
export type CategoryMutationResult = z.infer<typeof categoryMutationResultSchema>;

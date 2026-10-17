import { z } from "zod";

/**
 * The User's full name as they confirm it. Categorization compares it with a payment's
 * recipient to recognise a move between the User's own accounts, so extra spaces are
 * collapsed and the limits match profiles.full_name.
 */
export const fullNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "Enter your full name.").max(150, "Use 150 characters or fewer."));

export const setFullNameInputSchema = z.object({ fullName: fullNameSchema }).strict();

export const fullNameResultSchema = z.object({ fullName: fullNameSchema }).strict();

export type SetFullNameInput = z.input<typeof setFullNameInputSchema>;
export type FullNameResult = z.infer<typeof fullNameResultSchema>;

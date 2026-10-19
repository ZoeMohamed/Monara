import { z } from "zod";

export const USER_DELETION_PHRASE = "DELETE MY ACCOUNT";

export const deleteUserInputSchema = z
  .object({ confirmation: z.literal(USER_DELETION_PHRASE), acknowledged: z.literal(true) })
  .strict();

export const userDeletionStatusSchema = z.object({
  status: z.enum(["pending", "complete"]),
});

export const userActivityInputSchema = z.object({ userId: z.uuid() }).strict();
export const userActivityResultSchema = z.object({ active: z.boolean() });

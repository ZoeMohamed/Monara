// The User's own profile details. For now that is the full name asked for in onboarding,
// which categorization compares with payment recipients to spot transfers between the
// User's own accounts.
import {
  type FullNameResult,
  fullNameResultSchema,
  setFullNameInputSchema,
} from "@monara/contracts";
import { FinanceOperationError } from "./finance.ts";

export interface ProfileRepository {
  /** Stores the name on the User's profile; false when the User has no profile row. */
  setFullName(userId: string, fullName: string): Promise<boolean>;
}

export interface ProfileService {
  setFullName(userId: string, input: unknown): Promise<FullNameResult>;
}

export function createProfileService(repository: ProfileRepository): ProfileService {
  return {
    async setFullName(userId, input) {
      const { fullName } = setFullNameInputSchema.parse(input);
      if (!(await repository.setFullName(userId, fullName))) {
        throw new FinanceOperationError("NOT_FOUND", "Your profile was not found.");
      }
      return fullNameResultSchema.parse({ fullName });
    },
  };
}

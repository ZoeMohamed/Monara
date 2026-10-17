import type { MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError } from "./finance.ts";
import type { ProfileRepository } from "./profile.ts";

/**
 * profiles through the service-role client, which is the only way to write them:
 * signed-in browsers have select-only access. Callers must already have verified the User.
 */
export function createSupabaseProfileRepository(
  client: MonaraServiceRoleClient,
): ProfileRepository {
  return {
    async setFullName(userId, fullName) {
      const result = await client
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", userId)
        .select("id")
        .maybeSingle();
      if (result.error) {
        throw new FinanceOperationError("INTERNAL", "Your name could not be saved.");
      }
      return result.data !== null;
    },

    async fullName(userId) {
      const result = await client
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (result.error) {
        throw new FinanceOperationError("INTERNAL", "Your profile could not be read.");
      }
      return result.data?.full_name ?? null;
    },
  };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FinanceOperationError } from "./finance.ts";
import { createProfileService } from "./profile.ts";

const user = "60000000-0000-4000-8000-000000000006";

function memoryProfiles(known = [user]) {
  const names = new Map();
  return {
    names,
    repository: {
      async setFullName(userId, fullName) {
        if (!known.includes(userId)) return false;
        names.set(userId, fullName);
        return true;
      },
    },
  };
}

describe("profile full name", () => {
  it("stores the name the User confirmed, with spacing tidied", async () => {
    const { repository, names } = memoryProfiles();
    const result = await createProfileService(repository).setFullName(user, {
      fullName: "  Daffa   Abhipraya ",
    });
    assert.deepEqual(result, { fullName: "Daffa Abhipraya" });
    assert.equal(names.get(user), "Daffa Abhipraya");
  });

  it("rejects blank, one-letter, overlong, and unexpected input before storing", async () => {
    const { repository, names } = memoryProfiles();
    const service = createProfileService(repository);
    for (const input of [
      { fullName: "   " },
      { fullName: "A" },
      { fullName: "x".repeat(151) },
      { fullName: "Ok Name", userId: "someone-else" },
      {},
      null,
    ]) {
      await assert.rejects(() => service.setFullName(user, input), { name: "ZodError" });
    }
    assert.equal(names.size, 0);
  });

  it("writes only to the caller's own profile and reports a missing one", async () => {
    const { repository } = memoryProfiles([]);
    await assert.rejects(
      () => createProfileService(repository).setFullName(user, { fullName: "Daffa A" }),
      (error) => error instanceof FinanceOperationError && error.code === "NOT_FOUND",
    );
  });
});

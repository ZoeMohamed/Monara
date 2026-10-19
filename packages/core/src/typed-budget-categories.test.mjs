import assert from "node:assert/strict";
import { it } from "node:test";
import { createFinanceService } from "./finance.ts";

const userId = "10000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000001";
const caller = { userId, channel: "web" };
it("rejects income, exclusion and archived expense categories before budget creation or suggestion", async () => {
  for (const category of [
    { kind: "income", isArchived: false },
    { kind: "exclusion", isArchived: false },
    { kind: "expense", isArchived: true },
  ]) {
    let writes = 0;
    const service = createFinanceService(
      {
        listAllCategories: async () => [{ id: categoryId, ...category }],
        listTransactionsForDateRange: async () => [],
        createBudget: async () => {
          writes++;
          throw new Error("Unexpected write");
        },
      },
      { now: () => new Date("2026-10-19T00:00:00Z") },
    );
    await assert.rejects(
      service.createBudget(caller, {
        categoryId,
        name: "Test",
        cadence: "monthly",
        limit: { amountMinor: "50000", currency: "IDR" },
        startsOn: "2026-10-01",
        clientRequestId: "budget-attempt",
      }),
      { code: "VALIDATION_FAILED" },
    );
    await assert.rejects(service.suggestBudget(caller, { categoryId, cadence: "monthly" }), {
      code: "VALIDATION_FAILED",
    });
    assert.equal(writes, 0);
  }
});

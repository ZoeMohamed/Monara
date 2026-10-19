import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectRecurringBillProposals } from "./recurring-bills.ts";

function transaction(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    kind: "expense",
    flowDirection: "out",
    merchantName: "Streamly",
    money: { amountMinor: "149000", currency: "IDR" },
    occurredOn: "2026-07-10",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId: null,
    financialAccountId: "10000000-0000-4000-8000-000000000001",
    reviewStatus: "confirmed",
    source: "gmail_email",
    confidence: 0.95,
    deletedAt: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("recurring bill detection", () => {
  it("proposes a monthly bill from three similar confirmed expenses", () => {
    const proposals = detectRecurringBillProposals([
      transaction({ occurredOn: "2026-07-10" }),
      transaction({ occurredOn: "2026-08-10" }),
      transaction({ occurredOn: "2026-09-10", money: { amountMinor: "150000", currency: "IDR" } }),
    ]);
    assert.deepEqual(proposals[0], {
      financialAccountId: "10000000-0000-4000-8000-000000000001",
      merchantName: "Streamly",
      expectedAmount: { amountMinor: "149000", currency: "IDR" },
      intervalCount: 1,
      intervalUnit: "month",
      nextDueOn: "2026-10-10",
      cancellationUrl: null,
      confidence: 0.8,
    });
  });

  it("ignores pending, income, irregular, and materially different transactions", () => {
    const proposals = detectRecurringBillProposals([
      transaction({ occurredOn: "2026-07-10" }),
      transaction({ occurredOn: "2026-08-10", reviewStatus: "pending" }),
      transaction({ occurredOn: "2026-09-10", kind: "income" }),
      transaction({ occurredOn: "2026-11-25", money: { amountMinor: "500000", currency: "IDR" } }),
    ]);
    assert.deepEqual(proposals, []);
  });
});

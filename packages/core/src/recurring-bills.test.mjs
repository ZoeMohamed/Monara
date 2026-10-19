import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFinanceService } from "./finance.ts";
import { applyBillReview, detectRecurringBillCandidates } from "./recurring-bills.ts";

const ACCOUNT = "10000000-0000-4000-8000-000000000001";
const USER = "20000000-0000-4000-8000-000000000002";

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
    financialAccountId: ACCOUNT,
    reviewStatus: "confirmed",
    source: "gmail_email",
    confidence: 0.95,
    deletedAt: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

const monthly = (dates, overrides = {}) =>
  dates.map((occurredOn) => transaction({ occurredOn, ...overrides }));

describe("recurring bill detection", () => {
  it("proposes a monthly bill from three similar confirmed expenses", () => {
    const [candidate] = detectRecurringBillCandidates(
      [
        transaction({ occurredOn: "2026-07-10" }),
        transaction({ occurredOn: "2026-08-10" }),
        transaction({
          occurredOn: "2026-09-10",
          money: { amountMinor: "150000", currency: "IDR" },
        }),
      ],
      "2026-09-20",
    );
    assert.deepEqual(candidate?.proposal, {
      financialAccountId: ACCOUNT,
      merchantName: "Streamly",
      expectedAmount: { amountMinor: "149000", currency: "IDR" },
      intervalCount: 1,
      intervalUnit: "month",
      nextDueOn: "2026-10-10",
      cancellationUrl: null,
      confidence: 0.8,
    });
    assert.equal(candidate?.payments.length, 3);
  });

  it("keeps a monthly due date on the calendar day, clamped to short months", () => {
    const [endOfMonth] = detectRecurringBillCandidates(
      monthly(["2026-10-31", "2026-11-30", "2026-12-31"]),
      "2027-01-05",
    );
    assert.equal(endOfMonth?.proposal.nextDueOn, "2027-01-31");
    const [january] = detectRecurringBillCandidates(
      monthly(["2026-11-30", "2026-12-31", "2027-01-31"]),
      "2027-02-01",
    );
    assert.equal(january?.proposal.nextDueOn, "2027-02-28");
  });

  it("rolls the next due date past today and drops a bill that stopped", () => {
    const [due] = detectRecurringBillCandidates(
      monthly(["2026-07-10", "2026-08-10", "2026-09-10"]),
      "2026-10-15",
    );
    assert.equal(due?.proposal.nextDueOn, "2026-11-10");
    assert.deepEqual(
      detectRecurringBillCandidates(
        monthly(["2026-01-10", "2026-02-10", "2026-03-10"]),
        "2026-10-15",
      ),
      [],
    );
  });

  it("uses the latest price after a price rise and ignores one-off purchases", () => {
    const [candidate] = detectRecurringBillCandidates(
      [
        ...monthly(["2026-04-10", "2026-05-10"]),
        ...monthly(["2026-06-10", "2026-07-10", "2026-08-10"], {
          money: { amountMinor: "186000", currency: "IDR" },
        }),
        transaction({ occurredOn: "2026-07-22", money: { amountMinor: "35000", currency: "IDR" } }),
      ],
      "2026-08-20",
    );
    assert.equal(candidate?.proposal.expectedAmount.amountMinor, "186000");
    assert.equal(candidate?.payments.length, 3);
  });

  it("ignores pending, income, irregular, and too few transactions", () => {
    assert.deepEqual(
      detectRecurringBillCandidates(
        [
          transaction({ occurredOn: "2026-07-10" }),
          transaction({ occurredOn: "2026-08-10", reviewStatus: "pending" }),
          transaction({ occurredOn: "2026-09-10", kind: "income" }),
          transaction({ occurredOn: "2026-09-25" }),
        ],
        "2026-10-01",
      ),
      [],
    );
    assert.deepEqual(
      detectRecurringBillCandidates(
        monthly(["2026-07-10", "2026-07-30", "2026-09-10"]),
        "2026-09-20",
      ),
      [],
    );
  });

  it("proposes a weekly bill", () => {
    const [candidate] = detectRecurringBillCandidates(
      monthly(["2026-09-01", "2026-09-08", "2026-09-15"], { merchantName: "Laundry Kilat" }),
      "2026-09-17",
    );
    assert.equal(candidate?.proposal.intervalUnit, "week");
    assert.equal(candidate?.proposal.nextDueOn, "2026-09-22");
  });
});

describe("the AI check", () => {
  const [candidate] = detectRecurringBillCandidates(
    monthly(["2026-07-10", "2026-08-10", "2026-09-10"]),
    "2026-09-20",
  );
  const judge = (isBill, confidence) => [
    { key: "streamly", isBill, confidence, reason: "Same price every month." },
  ];

  it("drops a candidate the model says is not a bill", () => {
    assert.deepEqual(applyBillReview([candidate], judge(false, 0.9)), []);
  });

  it("moves confidence only within a band and never changes the proposal", () => {
    const [raised] = applyBillReview([candidate], judge(true, 1));
    assert.equal(raised?.proposal.confidence, 0.9);
    assert.equal(raised?.proposal.expectedAmount.amountMinor, "149000");
    assert.equal(raised?.reason, "Same price every month.");
    const [lowered] = applyBillReview([candidate], judge(true, 0.7));
    assert.equal(lowered?.proposal.confidence, 0.7);
    assert.deepEqual(applyBillReview([candidate], judge(true, 0)), []);
  });

  it("keeps the rules alone when the model did not answer, and ignores unknown keys", () => {
    const [kept] = applyBillReview([candidate], null);
    assert.equal(kept?.proposal.confidence, 0.8);
    assert.equal(kept?.reason, null);
    const extra = [{ key: "invented", isBill: true, confidence: 1, reason: "Made up." }];
    assert.equal(applyBillReview([candidate], extra).length, 1);
  });
});

function billRepository(transactions) {
  const bills = [];
  return {
    bills,
    async listTransactionsForDateRange() {
      return transactions;
    },
    async listAllRecurringBills() {
      return bills;
    },
    async createRecurringBill(_userId, input) {
      const bill = {
        id: crypto.randomUUID(),
        ...input.proposal,
        status: input.status,
        deletedAt: null,
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      };
      bills.push(bill);
      return bill;
    },
  };
}

describe("recurring bill operations", () => {
  const caller = { userId: USER, channel: "web" };
  const now = () => new Date("2026-09-20T03:00:00.000Z");
  const history = monthly(["2026-07-10", "2026-08-10", "2026-09-10"]);

  it("suggests bills after the AI check and saves nothing", async () => {
    const repository = billRepository(history);
    const sent = [];
    const service = createFinanceService(repository, {
      now,
      async reviewBills(candidates) {
        sent.push(...candidates);
        return [{ key: "streamly", isBill: true, confidence: 0.85, reason: "Monthly plan." }];
      },
    });
    const { items } = await service.suggestRecurringBills(caller, {});
    assert.equal(items.length, 1);
    assert.equal(items[0]?.reason, "Monthly plan.");
    assert.deepEqual(Object.keys(sent[0] ?? {}).sort(), [
      "intervalUnit",
      "key",
      "merchantName",
      "payments",
    ]);
    assert.equal(repository.bills.length, 0);
  });

  it("falls back to the rules when the AI check fails", async () => {
    const service = createFinanceService(billRepository(history), {
      now,
      async reviewBills() {
        throw new Error("model down");
      },
    });
    const { items } = await service.suggestRecurringBills(caller, {});
    assert.equal(items[0]?.proposal.confidence, 0.8);
  });

  it("saves only on the User's decision and does not suggest a decided merchant again", async () => {
    const repository = billRepository(history);
    const service = createFinanceService(repository, { now });
    const [suggestion] = (await service.suggestRecurringBills(caller, {})).items;
    assert.ok(suggestion);
    const input = { clientRequestId: "bill-1", proposal: suggestion.proposal };
    const tracked = await service.confirmRecurringBill(caller, input);
    assert.equal(tracked.status, "active");
    assert.equal((await service.confirmRecurringBill(caller, input)).id, tracked.id);
    assert.equal(repository.bills.length, 1);
    assert.deepEqual((await service.suggestRecurringBills(caller, {})).items, []);
    await assert.rejects(
      service.dismissRecurringBillSuggestion(caller, { ...input, clientRequestId: "bill-2" }),
      /already decided/,
    );
  });

  it("remembers a dismissal", async () => {
    const repository = billRepository(history);
    const service = createFinanceService(repository, { now });
    const [suggestion] = (await service.suggestRecurringBills(caller, {})).items;
    assert.ok(suggestion);
    const dismissed = await service.dismissRecurringBillSuggestion(caller, {
      clientRequestId: "bill-3",
      proposal: suggestion.proposal,
    });
    assert.equal(dismissed.status, "dismissed");
    assert.deepEqual((await service.suggestRecurringBills(caller, {})).items, []);
  });
});

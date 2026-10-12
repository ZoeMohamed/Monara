import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billDueReminderSchema,
  budgetThresholdReminderSchema,
  calendarDateSchema,
  confirmDestructiveActionInputSchema,
  confirmRecurringBillInputSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createFinancialAccountInputSchema,
  createTransactionInputSchema,
  destructiveActionConfirmationSchema,
  listTransactionsInputSchema,
  positiveMoneySchema,
  reminderPreferencesSchema,
  setReminderPreferencesInputSchema,
  transactionSchema,
  updateBudgetInputSchema,
  updatePendingTransactionInputSchema,
  updateTransactionInputSchema,
} from "./index.ts";

const ids = {
  accountA: "00000000-0000-4000-8000-000000000001",
  accountB: "00000000-0000-4000-8000-000000000002",
  budget: "00000000-0000-4000-8000-000000000003",
  category: "00000000-0000-4000-8000-000000000004",
  reminder: "00000000-0000-4000-8000-000000000005",
  bill: "00000000-0000-4000-8000-000000000006",
  transaction: "00000000-0000-4000-8000-000000000007",
};

const timestamp = "2026-10-12T09:00:00+07:00";
const money = { amountMinor: "28000", currency: "IDR" };
const nullableValues = {
  kind: null,
  merchantName: null,
  money: null,
  occurredOn: null,
  occurredTime: null,
  description: null,
  location: null,
  accountHint: null,
  categoryId: null,
  financialAccountId: null,
  fromFinancialAccountId: null,
  toFinancialAccountId: null,
};

describe("common value contracts", () => {
  it("accepts real calendar dates and rejects impossible dates", () => {
    assert.equal(calendarDateSchema.safeParse("2026-10-12").success, true);
    assert.equal(calendarDateSchema.safeParse("2026-02-30").success, false);
  });
});

describe("transaction contracts", () => {
  it("preserves unknown values on pending imports", () => {
    const result = transactionSchema.safeParse({
      id: ids.transaction,
      ...nullableValues,
      reviewStatus: "pending",
      source: "gmail_email",
      confidence: null,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    assert.equal(result.success, true);
  });

  it("rejects confirmed transactions with missing required values", () => {
    const result = transactionSchema.safeParse({
      id: ids.transaction,
      ...nullableValues,
      reviewStatus: "confirmed",
      source: "gmail_email",
      confidence: 0.94,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    assert.equal(result.success, false);
  });

  it("distinguishes the originating channel and WhatsApp capture method", () => {
    for (const source of [
      "manual_form",
      "gmail_email",
      "in_app_chat",
      "whatsapp_text",
      "whatsapp_receipt",
      "whatsapp_voice",
    ]) {
      assert.equal(
        transactionSchema.safeParse({
          id: ids.transaction,
          ...nullableValues,
          reviewStatus: "pending",
          source,
          confidence: null,
          deletedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).success,
        true,
      );
    }

    assert.equal(
      transactionSchema.safeParse({
        id: ids.transaction,
        ...nullableValues,
        reviewStatus: "pending",
        source: "whatsapp",
        confidence: null,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
      false,
    );
  });

  it("rejects new transactions with missing required values", () => {
    const result = createTransactionInputSchema.safeParse({
      ...nullableValues,
      clientRequestId: "client-request-missing-values",
    });
    assert.equal(result.success, false);
  });

  it("requires different owned accounts for confirmed transfers", () => {
    const values = {
      ...nullableValues,
      kind: "transfer",
      money,
      occurredOn: "2026-10-12",
      fromFinancialAccountId: ids.accountA,
      toFinancialAccountId: ids.accountA,
    };
    assert.equal(
      confirmTransactionInputSchema.safeParse({
        transactionId: ids.transaction,
        expectedUpdatedAt: timestamp,
        values,
      }).success,
      false,
    );
    assert.equal(
      confirmTransactionInputSchema.safeParse({
        transactionId: ids.transaction,
        expectedUpdatedAt: timestamp,
        values: { ...values, toFinancialAccountId: ids.accountB },
      }).success,
      true,
    );
  });

  it("does not let callers smuggle identity into strict operation inputs", () => {
    const result = createTransactionInputSchema.safeParse({
      ...nullableValues,
      kind: "expense",
      merchantName: "Kopi Kenangan",
      money,
      occurredOn: "2026-10-12",
      financialAccountId: ids.accountA,
      clientRequestId: "client-request-1",
      userId: "00000000-0000-4000-8000-000000000099",
    });
    assert.equal(result.success, false);
  });

  it("does not let callers choose transaction provenance", () => {
    const result = createTransactionInputSchema.safeParse({
      ...nullableValues,
      kind: "expense",
      merchantName: "Kopi Kenangan",
      money,
      occurredOn: "2026-10-12",
      financialAccountId: ids.accountA,
      clientRequestId: "client-request-2",
      source: "gmail_email",
    });
    assert.equal(result.success, false);
  });

  it("requires direct creates to identify an account and merchant or description", () => {
    const base = {
      ...nullableValues,
      kind: "expense",
      money,
      occurredOn: "2026-10-12",
      clientRequestId: "client-request-3",
    };
    assert.equal(createTransactionInputSchema.safeParse(base).success, false);
    assert.equal(
      createTransactionInputSchema.safeParse({
        ...base,
        description: "Coffee",
        financialAccountId: ids.accountA,
      }).success,
      true,
    );
  });

  it("requires at least one field in pending edits", () => {
    const result = updatePendingTransactionInputSchema.safeParse({
      transactionId: ids.transaction,
      expectedUpdatedAt: timestamp,
      changes: {},
    });
    assert.equal(result.success, false);
  });

  it("supports optimistic edits for confirmed ledger transactions", () => {
    const result = updateTransactionInputSchema.safeParse({
      transactionId: ids.transaction,
      expectedUpdatedAt: timestamp,
      changes: { money: { amountMinor: "38000", currency: "IDR" } },
    });
    assert.equal(result.success, true);
  });

  it("applies pagination defaults without making them required at input", () => {
    assert.deepEqual(listTransactionsInputSchema.parse({}), { limit: 50 });
  });
});

describe("ledger resource contracts", () => {
  it("keeps Financial Accounts within the PRD types and stores no balance", () => {
    const input = {
      name: "Daily wallet",
      institution: "GoPay",
      accountType: "wallet",
      currency: "IDR",
      lastFour: "1234",
      clientRequestId: "account-request-1",
    };
    assert.equal(createFinancialAccountInputSchema.safeParse(input).success, true);
    assert.equal(
      createFinancialAccountInputSchema.safeParse({ ...input, accountType: "credit_card" }).success,
      false,
    );
    assert.equal(
      createFinancialAccountInputSchema.safeParse({ ...input, currentBalance: "100000" }).success,
      false,
    );
  });
});

describe("operation safety contracts", () => {
  it("keeps IDR amounts integral and within the database amount bound", () => {
    assert.equal(
      positiveMoneySchema.safeParse({
        amountMinor: "99999999999999999999",
        currency: "IDR",
      }).success,
      true,
    );
    assert.equal(
      positiveMoneySchema.safeParse({
        amountMinor: "100000000000000000000",
        currency: "IDR",
      }).success,
      false,
    );
    assert.equal(
      positiveMoneySchema.safeParse({ amountMinor: "28.50", currency: "IDR" }).success,
      false,
    );
  });

  it("binds a T2 confirmation to exact resources and literal yes", () => {
    const confirmationId = "00000000-0000-4000-8000-000000000008";
    assert.equal(
      destructiveActionConfirmationSchema.safeParse({
        confirmationId,
        action: "delete_transaction",
        resourceIds: [ids.transaction],
        summary: "Delete one transaction",
        expiresAt: timestamp,
      }).success,
      true,
    );
    assert.equal(
      confirmDestructiveActionInputSchema.safeParse({ confirmationId, answer: "yes" }).success,
      true,
    );
    assert.equal(
      confirmDestructiveActionInputSchema.safeParse({ confirmationId, answer: "no" }).success,
      false,
    );
  });
});

describe("budget and recurring-bill contracts", () => {
  it("defaults a budget warning threshold to 80 percent", () => {
    const result = createBudgetInputSchema.parse({
      categoryId: ids.category,
      name: "Digital",
      cadence: "monthly",
      limit: { amountMinor: "300000", currency: "IDR" },
      startsOn: "2026-10-01",
      clientRequestId: "budget-request-1",
    });
    assert.equal(result.warningPercent, 80);
  });

  it("does not inject the default threshold into unrelated budget patches", () => {
    const result = updateBudgetInputSchema.parse({
      budgetId: ids.budget,
      expectedUpdatedAt: timestamp,
      changes: { name: "Food & Drinks" },
    });
    assert.deepEqual(result.changes, { name: "Food & Drinks" });
  });

  it("accepts only HTTPS cancellation guidance", () => {
    const input = {
      financialAccountId: ids.accountA,
      merchantName: "Netflix",
      expectedAmount: { amountMinor: "186000", currency: "IDR" },
      intervalCount: 1,
      intervalUnit: "month",
      nextDueOn: "2026-11-01",
      cancellationUrl: "https://www.netflix.com/cancelplan",
    };
    assert.equal(
      confirmRecurringBillInputSchema.safeParse({
        clientRequestId: "bill-request-1",
        proposal: { ...input, confidence: 0.92 },
      }).success,
      true,
    );
    assert.equal(
      confirmRecurringBillInputSchema.safeParse({
        clientRequestId: "bill-request-2",
        proposal: { ...input, cancellationUrl: "javascript:alert(1)", confidence: 0.92 },
      }).success,
      false,
    );
  });
});

describe("reminder contracts", () => {
  const base = {
    id: ids.reminder,
    status: "unread",
    title: "Reminder",
    message: "Review this alert.",
    dedupeKey: "dedupe-key",
    scheduledFor: timestamp,
    readAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  it("keeps kind-specific reminder ownership explicit", () => {
    assert.equal(
      budgetThresholdReminderSchema.safeParse({
        ...base,
        kind: "budget_threshold",
        budgetId: ids.budget,
        thresholdPercent: 80,
      }).success,
      true,
    );
    assert.equal(
      billDueReminderSchema.safeParse({
        ...base,
        kind: "bill_due",
        recurringBillId: ids.bill,
        offsetDays: 3,
      }).success,
      true,
    );
  });

  it("keeps read status and read timestamp consistent", () => {
    assert.equal(
      budgetThresholdReminderSchema.safeParse({
        ...base,
        status: "read",
        kind: "budget_threshold",
        budgetId: ids.budget,
        thresholdPercent: 80,
      }).success,
      false,
    );
  });

  it("supports the WhatsApp Reminder opt-out preference", () => {
    assert.equal(
      reminderPreferencesSchema.safeParse({ whatsAppEnabled: false, updatedAt: timestamp }).success,
      true,
    );
    assert.equal(
      setReminderPreferencesInputSchema.safeParse({
        whatsAppEnabled: false,
        expectedUpdatedAt: timestamp,
      }).success,
      true,
    );
  });
});

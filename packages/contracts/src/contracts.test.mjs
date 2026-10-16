import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billDueReminderSchema,
  budgetThresholdReminderSchema,
  calendarDateSchema,
  claimGmailMessagesInputSchema,
  confirmDestructiveActionInputSchema,
  confirmRecurringBillInputSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createFinancialAccountInputSchema,
  createTransactionInputSchema,
  destructiveActionConfirmationSchema,
  emailInstitutions,
  extractedTransactionSchema,
  findInstitution,
  findInstitutionBySender,
  gmailJobSchema,
  institutions,
  listTransactionsInputSchema,
  positiveMoneySchema,
  recordGmailExtractionInputSchema,
  reminderPreferencesSchema,
  reportGmailConnectionErrorInputSchema,
  reportGmailSyncFailureInputSchema,
  requestGmailSyncInputSchema,
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
    assert.equal(
      createTransactionInputSchema.safeParse({
        ...nullableValues,
        kind: "exclusion",
        merchantName: "Reimbursement",
        financialAccountId: ids.accountA,
        clientRequestId: "client-request-incomplete-exclusion",
      }).success,
      false,
    );
  });

  it("keeps exclusion as a third type with the same confirmed lifecycle", () => {
    const values = {
      ...nullableValues,
      kind: "expense",
      money,
      occurredOn: "2026-10-12",
      financialAccountId: ids.accountA,
    };
    assert.equal(
      confirmTransactionInputSchema.safeParse({
        transactionId: ids.transaction,
        expectedUpdatedAt: timestamp,
        values,
      }).success,
      true,
    );
    assert.equal(
      transactionSchema.safeParse({
        id: ids.transaction,
        ...values,
        kind: "exclusion",
        reviewStatus: "confirmed",
        source: "gmail_email",
        confidence: 0.9,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
      true,
    );
    assert.equal(
      transactionSchema.safeParse({
        id: ids.transaction,
        ...nullableValues,
        kind: "exclusion",
        reviewStatus: "confirmed",
        source: "gmail_email",
        confidence: 0.9,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
      true,
    );
    assert.equal(
      transactionSchema.safeParse({
        id: ids.transaction,
        ...values,
        kind: "transfer",
        reviewStatus: "confirmed",
        source: "gmail_email",
        confidence: 0.9,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
      false,
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

  it("does not let a confirmed transaction patch clear required values", () => {
    for (const changes of [{ kind: null }, { money: null }, { occurredOn: null }]) {
      assert.equal(
        updateTransactionInputSchema.safeParse({
          transactionId: ids.transaction,
          expectedUpdatedAt: timestamp,
          changes,
        }).success,
        false,
      );
    }
  });

  it("rejects a removed transfer direction in confirmed patches", () => {
    assert.equal(
      updateTransactionInputSchema.safeParse({
        transactionId: ids.transaction,
        expectedUpdatedAt: timestamp,
        changes: { kind: "transfer" },
      }).success,
      false,
    );
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

describe("Gmail extraction contracts", () => {
  const connectionId = "00000000-0000-4000-8000-000000000010";
  const processedMessageId = "00000000-0000-4000-8000-000000000020";
  const extracted = {
    kind: "expense",
    merchantName: "Kopi Contoh",
    money,
    occurredOn: "2026-10-12",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: "BCA ****1234",
    accountLastFour: "1234",
    confidence: 0.8,
  };

  it("rejects fractional or zero Rupiah and category or account ids", () => {
    assert.equal(extractedTransactionSchema.safeParse(extracted).success, true);
    for (const amountMinor of ["0", "25000.5"]) {
      assert.equal(
        extractedTransactionSchema.safeParse({ ...extracted, money: { ...money, amountMinor } })
          .success,
        false,
      );
    }
    assert.equal(
      extractedTransactionSchema.safeParse({ ...extracted, categoryId: ids.category }).success,
      false,
    );
    assert.equal(
      extractedTransactionSchema.safeParse({ ...extracted, financialAccountId: ids.accountA })
        .success,
      false,
    );
  });

  it("claims at most one listed page, each message with a timestamp", () => {
    const claim = (messages) =>
      claimGmailMessagesInputSchema.safeParse({ connectionId, messages }).success;
    assert.equal(claim([{ gmailMessageId: "m1", receivedAt: timestamp }]), true);
    assert.equal(claim([{ gmailMessageId: "m1", receivedAt: null }]), false);
    assert.equal(
      claim(
        Array.from({ length: 101 }, (_, i) => ({ gmailMessageId: `m${i}`, receivedAt: timestamp })),
      ),
      false,
    );
  });

  it("records only registry institutions and a sender verification flag", () => {
    const base = { processedMessageId, outcome: "skipped", items: [], senderVerified: false };
    assert.equal(
      recordGmailExtractionInputSchema.safeParse({ ...base, institutionKey: null }).success,
      true,
    );
    assert.equal(
      recordGmailExtractionInputSchema.safeParse({ ...base, institutionKey: "NOT_A_BANK" }).success,
      false,
    );
    assert.equal(
      recordGmailExtractionInputSchema.safeParse({
        ...base,
        institutionKey: null,
        senderVerified: undefined,
      }).success,
      false,
    );
  });

  it("reports a sync failure only with a known reason", () => {
    const report = (reason) =>
      reportGmailSyncFailureInputSchema.safeParse({ connectionId, reason }).success;
    assert.equal(report("gmail_unavailable"), true);
    assert.equal(report("sync_failed"), true);
    assert.equal(report("agent_unavailable"), false);
  });

  it("keeps items only on a transactions outcome", () => {
    const record = (outcome, items) =>
      recordGmailExtractionInputSchema.safeParse({
        processedMessageId,
        outcome,
        items,
        institutionKey: "BCA_CC",
        senderVerified: true,
      }).success;
    assert.equal(record("transactions", [extracted]), true);
    assert.equal(record("transactions", []), false);
    assert.equal(record("skipped", []), true);
    assert.equal(record("failed", [extracted]), false);
  });

  it("reports a connection error only with a known reason", () => {
    assert.equal(
      reportGmailConnectionErrorInputSchema.safeParse({
        connectionId,
        reason: "authorization_lost",
      }).success,
      true,
    );
    assert.equal(
      reportGmailConnectionErrorInputSchema.safeParse({ connectionId, reason: "anything" }).success,
      false,
    );
  });

  it("never accepts a User id on a queued job", () => {
    const job = { kind: "gmail.extract", connectionId, gmailMessageId: "m1", receivedAt: null };
    assert.equal(gmailJobSchema.safeParse(job).success, true);
    assert.equal(gmailJobSchema.safeParse({ ...job, userId: ids.accountA }).success, false);
  });

  it("requires the backend to send the previous sync cursor without identity", () => {
    assert.equal(
      requestGmailSyncInputSchema.safeParse({ connectionId, since: timestamp }).success,
      true,
    );
    assert.equal(
      requestGmailSyncInputSchema.safeParse({ connectionId, since: null }).success,
      true,
    );
    assert.equal(requestGmailSyncInputSchema.safeParse({ connectionId }).success, false);
    assert.equal(
      requestGmailSyncInputSchema.safeParse({
        connectionId,
        since: timestamp,
        userId: ids.accountA,
      }).success,
      false,
    );
  });
});

describe("institution registry", () => {
  it("loads every entry, with senders only on detectable ones", () => {
    assert.ok(emailInstitutions.length > 0);
    assert.ok(institutions.length > emailInstitutions.length);
    assert.ok(emailInstitutions.every((entry) => entry.senderEmails.length > 0));
    assert.equal(findInstitution("GoPay_Wallet")?.senderEmails.length, 0);
  });

  it("finds an entry by its exact sender, ignoring case only", () => {
    assert.equal(findInstitutionBySender("KARTUKREDITBCA@klikbca.com")?.key, "BCA_CC");
    assert.equal(findInstitutionBySender("someone@klikbca.com"), null);
    assert.equal(findInstitutionBySender("bca@bca.co.id.evil.example"), null);
  });

  it("accepts only registry keys on Financial Accounts", () => {
    const account = {
      name: "BCA card",
      institution: "BCA",
      accountType: "bank",
      currency: "IDR",
      lastFour: "1234",
      clientRequestId: "request-1",
    };
    assert.equal(
      createFinancialAccountInputSchema.parse(account).institutionKey,
      null,
      "institutionKey defaults to none",
    );
    assert.equal(
      createFinancialAccountInputSchema.safeParse({ ...account, institutionKey: "BCA_CC" }).success,
      true,
    );
    assert.equal(
      createFinancialAccountInputSchema.safeParse({ ...account, institutionKey: "BCA" }).success,
      false,
    );
  });
});

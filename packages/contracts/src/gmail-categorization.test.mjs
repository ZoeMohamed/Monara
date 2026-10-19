import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createCategoryInputSchema,
  extractedTransactionSchema,
  gmailSyncCountsSchema,
  reportGmailProcessingRetryInputSchema,
  setImportedCategoryInputSchema,
  updateCategoryInputSchema,
} from "./index.ts";

const transactionId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
it("requires a category type and never permits changing it", () => {
  const input = { name: "Salary", icon: "income", color: "#10B981", clientRequestId: categoryId };
  assert.equal(createCategoryInputSchema.safeParse(input).success, false);
  assert.equal(createCategoryInputSchema.parse({ ...input, kind: "income" }).kind, "income");
  assert.equal(
    updateCategoryInputSchema.safeParse({
      categoryId,
      expectedUpdatedAt: "2026-10-19T00:00:00Z",
      changes: { kind: "expense" },
    }).success,
    false,
  );
});
it("requires a category ID and final kind together, with bounded confidence", () => {
  assert.deepEqual(
    setImportedCategoryInputSchema.parse({
      transactionId,
      categoryId,
      kind: "income",
      confidence: 0.95,
    }),
    { transactionId, categoryId, kind: "income", confidence: 0.95 },
  );
  assert.equal(
    setImportedCategoryInputSchema.safeParse({
      transactionId,
      categoryId,
      kind: null,
      confidence: 1,
    }).success,
    false,
  );
  assert.equal(
    setImportedCategoryInputSchema.safeParse({
      transactionId,
      categoryId,
      kind: "expense",
      confidence: 1.1,
    }).success,
    false,
  );
  assert.equal(
    setImportedCategoryInputSchema.safeParse({
      transactionId,
      categoryId,
      kind: "expense",
      confidence: 0.99,
      amountMinor: "99",
    }).success,
    false,
  );
  assert.equal(
    setImportedCategoryInputSchema.safeParse({
      transactionId,
      categoryId: null,
      kind: null,
      confidence: null,
    }).success,
    true,
  );
  assert.equal(
    setImportedCategoryInputSchema.safeParse({ transactionId, categoryName: "Legacy category" })
      .success,
    true,
  );
});
it("defaults old queue evidence safely and keeps dates unknown", () => {
  const item = extractedTransactionSchema.parse({
    kind: null,
    merchantName: null,
    money: null,
    occurredOn: null,
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    accountLastFour: null,
    confidence: null,
  });
  assert.equal(item.counterpartyType, "unknown");
  assert.equal(item.counterpartyName, null);
  assert.equal(item.isTransfer, false);
  assert.equal(item.internalTransfer, false);
  assert.equal(item.occurredOn, null);
  const counts = gmailSyncCountsSchema.parse({
    imported: 1,
    skipped: 0,
    failed: 0,
    inProgress: 0,
    importedTransactions: 1,
  });
  assert.equal(counts.categorizing, 0);
  assert.equal(counts.needsReview, 0);
});

it("bounds provider waits and rejects mixed retry identities", () => {
  assert.equal(
    reportGmailProcessingRetryInputSchema.safeParse({ transactionId, delaySeconds: 900 }).success,
    true,
  );
  for (const input of [
    { transactionId, delaySeconds: 901 },
    { transactionId, delaySeconds: 0.5 },
    { transactionId, connectionId: categoryId, delaySeconds: 1 },
    { delaySeconds: 1 },
  ]) {
    assert.equal(reportGmailProcessingRetryInputSchema.safeParse(input).success, false);
  }
});

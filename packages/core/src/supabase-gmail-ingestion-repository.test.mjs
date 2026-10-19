import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSupabaseGmailIngestionRepository } from "./supabase-gmail-ingestion-repository.ts";

const transactionId = "00000000-0000-4000-8000-000000000030";
const userId = "00000000-0000-4000-8000-000000000001";

function repositoryWithHolderName(holderName) {
  const client = {
    rpc(operation, input) {
      assert.equal(operation, "imported_transaction_for_category");
      assert.deepEqual(input, { p_transaction_id: transactionId });
      return {
        async maybeSingle() {
          return {
            error: null,
            data: {
              user_id: userId,
              merchant_name: null,
              location: null,
              needs_category: true,
              kind: "exclusion",
              flow_direction: "out",
              description: null,
              counterparty_name: "Zoe Demo",
              counterparty_type: "person",
              is_transfer: true,
              internal_transfer: false,
              holder_name: holderName,
            },
          };
        },
      };
    },
    from(table) {
      assert.equal(table, "categories");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async limit() {
          return { data: [], error: null };
        },
      };
    },
  };
  return createSupabaseGmailIngestionRepository(client);
}

describe("imported transaction holder names", () => {
  it("accepts whitespace-padded profile names without truncating the full 150-character name", async () => {
    const fullName = `${"A".repeat(148)} B`;
    const repository = repositoryWithHolderName(`    ${fullName}    `);
    const transaction = await repository.resolveImportedTransaction(transactionId);
    assert.equal(transaction.holderName, fullName);
    assert.equal(transaction.holderName.length, 150);
  });

  it("uses the same whitespace normalization as connection resolution", async () => {
    const repository = repositoryWithHolderName("  Zoe \n Demo  ");
    const transaction = await repository.resolveImportedTransaction(transactionId);
    assert.equal(transaction.holderName, "Zoe Demo");
  });

  it("leaves missing or blank confirmed names unavailable as identity evidence", async () => {
    for (const name of [null, "   "]) {
      const repository = repositoryWithHolderName(name);
      const transaction = await repository.resolveImportedTransaction(transactionId);
      assert.equal(transaction.holderName, null);
      assert.equal(transaction.internalTransfer, false);
    }
  });
});

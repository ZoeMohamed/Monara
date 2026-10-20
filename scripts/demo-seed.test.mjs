import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exclusionCategoryPresets,
  expenseCategoryPresets,
  incomeCategoryPresets,
} from "../packages/contracts/src/category-presets.ts";
import {
  addDays,
  buildBills,
  buildBudgets,
  buildGoals,
  buildSynthetic,
  capPersonAmount,
  daysBetween,
  monthsBackStart,
  personNamer,
  scrubTransaction,
  withFallbackDescription,
} from "./lib/demo-seed.mjs";

const kinds = new Map([
  ...expenseCategoryPresets.map((c) => [c.slug, "expense"]),
  ...incomeCategoryPresets.map((c) => [c.slug, "income"]),
  ...exclusionCategoryPresets.map((c) => [c.slug, "exclusion"]),
]);

describe("demo seed dates", () => {
  it("adds and counts days across month ends", () => {
    assert.equal(addDays("2026-10-30", 3), "2026-11-02");
    assert.equal(daysBetween("2026-09-20", "2026-10-20"), 30);
    assert.equal(monthsBackStart("2026-10-20", 3), "2026-07-01");
    assert.equal(monthsBackStart("2026-02-10", 3), "2025-11-01");
  });
});

describe("scrubbing copied transactions", () => {
  const base = {
    transaction_type: "expense",
    merchant_name: "Marcel Satia Nugraha",
    amount: "600000",
    occurred_on: "2026-10-02",
    occurred_time: "12:47:00",
    description: "Transfer to Marcel for dinner",
    location: "Jakarta",
    review_status: "confirmed",
    accountKey: "BCA_MyBCA",
    gmail_extraction_evidence: { snippet: "private" },
    processed_gmail_message_id: "m1",
    ai_confidence: 0.9,
  };

  it("replaces a private individual's name and drops their free text", () => {
    const name = personNamer();
    const copy = scrubTransaction(base, "person", name(base.merchant_name));
    assert.notEqual(copy.merchant_name, "Marcel Satia Nugraha");
    assert.equal(copy.description, "Transfer");
    assert.equal(copy.location, null);
    assert.equal(copy.amount, "600000");
  });

  it("brings a large payment to a private individual down to an everyday transfer", () => {
    assert.equal(capPersonAmount(23_000), 23_000);
    assert.equal(capPersonAmount("750000"), "750000");
    for (const amount of [900_000, 3_500_000, 16_500_000]) {
      const capped = capPersonAmount(amount);
      assert.ok(capped >= 400_000 && capped <= 750_000, `${amount} -> ${capped}`);
    }
    const name = personNamer();
    const copy = scrubTransaction(
      { ...base, amount: "16500000" },
      "person",
      name(base.merchant_name),
    );
    assert.ok(Number(copy.amount) <= 750_000);
    const shop = scrubTransaction(
      { ...base, amount: "16500000", merchant_name: "Stockbit" },
      "investment",
      null,
    );
    assert.equal(shop.amount, "16500000");
  });

  it("keeps one stand-in per real name and never copies Gmail fields", () => {
    const name = personNamer();
    assert.equal(name("Erdafa Andikri"), name("  erdafa andikri "));
    assert.notEqual(name("Erdafa Andikri"), name("Marcel Satia Nugraha"));
    const copy = scrubTransaction(base, "person", name(base.merchant_name));
    for (const key of [
      "gmail_extraction_evidence",
      "processed_gmail_message_id",
      "ai_confidence",
    ]) {
      assert.equal(key in copy, false);
    }
  });

  it("keeps a business as it is, and gives a nameless card payment a description", () => {
    const shop = scrubTransaction(
      { ...base, merchant_name: "Starbucks", description: null },
      "resto-cafe",
      null,
    );
    assert.equal(shop.merchant_name, "Starbucks");
    const nameless = withFallbackDescription(
      scrubTransaction({ ...base, merchant_name: "", description: null }, "misc", null),
    );
    assert.equal(nameless.description, "Card payment");
  });
});

describe("synthetic history", () => {
  const range = { start: "2026-07-21", end: "2026-09-19", seed: 7 };
  const rows = buildSynthetic(range);

  it("is deterministic for one seed and differs for another", () => {
    assert.deepEqual(rows, buildSynthetic(range));
    assert.notDeepEqual(rows, buildSynthetic({ ...range, seed: 8 }));
  });

  it("stays inside the window, with positive whole amounts", () => {
    assert.ok(rows.length > 120, `got ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.occurred_on >= range.start && row.occurred_on <= range.end);
      assert.ok(Number.isInteger(row.amount) && row.amount > 0);
      assert.ok(row.merchant_name || row.description);
    }
  });

  it("uses only real categories whose kind matches the transaction type", () => {
    for (const row of rows) {
      const kind = kinds.get(row.categorySlug);
      assert.ok(kind, `unknown category ${row.categorySlug}`);
      assert.equal(kind, row.transaction_type, `${row.merchant_name} is ${row.transaction_type}`);
    }
  });

  it("books a salary on the 1st and the fixed bills each month", () => {
    const salaries = rows.filter((row) => row.categorySlug === "salary");
    assert.deepEqual(salaries.map((row) => row.occurred_on).sort(), ["2026-08-01", "2026-09-01"]);
    for (const merchant of ["PLN", "Telkomsel", "Spotify"]) {
      assert.ok(rows.filter((row) => row.merchant_name === merchant).length >= 2, merchant);
    }
  });

  it("adds only income and own-account moves for the stretch real data already covers", () => {
    const supplement = buildSynthetic({
      start: "2026-09-21",
      end: "2026-10-20",
      seed: 7,
      incomeOnly: true,
    });
    assert.ok(supplement.some((row) => row.categorySlug === "salary"));
    assert.ok(supplement.every((row) => row.transaction_type !== "expense"));
  });

  it("returns nothing for an empty window", () => {
    assert.deepEqual(buildSynthetic({ start: "2026-10-01", end: "2026-09-01", seed: 1 }), []);
  });
});

describe("budgets, goals and bills", () => {
  const today = "2026-10-20";
  it("budgets expense categories only, from three months back", () => {
    for (const budget of buildBudgets(today)) {
      assert.equal(kinds.get(budget.categorySlug), "expense");
      assert.equal(budget.starts_on, "2026-07-01");
    }
  });
  it("keeps saved within target and targets in the future", () => {
    for (const goal of buildGoals(today)) {
      assert.ok(goal.saved_amount <= goal.target_amount);
      assert.ok(goal.target_date > today);
    }
  });
  it("schedules each bill for a date after today", () => {
    const bills = buildBills(today);
    assert.ok(bills.length >= 3);
    for (const bill of bills)
      assert.ok(bill.next_due_on > today, `${bill.merchant_name} ${bill.next_due_on}`);
  });
});

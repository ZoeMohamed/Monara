import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetCategoryError, budgetDraftOf, rebaseBudgetDraft } from "./budget-draft.ts";

const category = { id: "expense", name: "Groceries", kind: "expense", isArchived: false };
const saved = {
  name: "Groceries budget",
  categoryId: category.id,
  cadence: "monthly",
  limit: { amountMinor: "700000", currency: "IDR" },
  startsOn: "2026-10-01",
  warningPercent: 80,
  isActive: true,
};

describe("budget draft recovery", () => {
  it("preserves user edits while accepting untouched settings changed elsewhere", () => {
    const initial = budgetDraftOf(saved, "2026-10-17");
    const mine = { ...initial, amount: "850000", warningPercent: "90" };
    const latest = budgetDraftOf(
      {
        ...saved,
        name: "Family groceries",
        startsOn: "2026-10-25",
        isActive: false,
        limit: { amountMinor: "800000", currency: "IDR" },
      },
      "2026-10-17",
    );
    const merged = rebaseBudgetDraft(mine, initial, latest);
    assert.equal(merged.amount, "850000");
    assert.equal(merged.warningPercent, "90");
    assert.equal(merged.name, "Family groceries");
    assert.equal(merged.startsOn, "2026-10-25");
    assert.equal(merged.isActive, false);
    assert.equal(mine.name, "Groceries budget");
  });

  it("keeps large financial limits exact during draft recovery", () => {
    const initial = budgetDraftOf(saved, "2026-10-17");
    const latest = budgetDraftOf(
      { ...saved, limit: { amountMinor: "99999999999999999999", currency: "IDR" } },
      "2026-10-17",
    );
    assert.equal(rebaseBudgetDraft(initial, initial, latest).amount, "99999999999999999999");
  });

  it("rejects removed, archived and excluded categories before a write", () => {
    assert.match(budgetCategoryError([category], "removed"), /available expense category/);
    assert.match(budgetCategoryError([{ ...category, isArchived: true }], category.id), /archived/);
    assert.match(
      budgetCategoryError(
        [{ ...category, name: "User renamed reason", kind: "exclusion" }],
        category.id,
      ),
      /Income and exclusions/,
    );
    assert.match(
      budgetCategoryError([{ ...category, name: "Salary", kind: "income" }], category.id),
      /expense category/,
    );
    assert.equal(budgetCategoryError([{ ...category, name: "Internal" }], category.id), null);
    assert.equal(budgetCategoryError([category], category.id), null);
  });
});

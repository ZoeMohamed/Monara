import assert from "node:assert/strict";
import test from "node:test";
import {
  exclusionCategoryPresets,
  exclusionCategorySchema,
  expenseCategoryPresets,
  isExclusionCategoryName,
} from "./category-presets.ts";
import { transactionKindSchema } from "./transactions.ts";

test("the UI category catalog covers all expense presets and the six explicit exclusions", () => {
  assert.equal(expenseCategoryPresets.length, 19);
  assert.deepEqual(
    exclusionCategoryPresets.map(({ name }) => name),
    ["Repayment", "Internal", "Reimbursed", "Investment", "One-off", "Cancelled"],
  );
  const slugs = [...expenseCategoryPresets, ...exclusionCategoryPresets].map(({ slug }) => slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const category of exclusionCategoryPresets) {
    assert.equal(exclusionCategorySchema.parse(category.slug), category.slug);
    assert.equal(isExclusionCategoryName(category.name), true);
  }
  assert.equal(isExclusionCategoryName(" internal "), true);
  assert.equal(isExclusionCategoryName("REIMBURSED"), true);
  assert.equal(isExclusionCategoryName("Unknown"), false);
  assert.equal(isExclusionCategoryName(null), false);
  assert.deepEqual(
    exclusionCategoryPresets.filter(({ automated }) => automated).map(({ slug }) => slug),
    ["internal"],
  );
});

test("the stored ledger has exclusion as a type and no transfer", () => {
  assert.equal(transactionKindSchema.parse("exclusion"), "exclusion");
  assert.equal(transactionKindSchema.safeParse("transfer").success, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  exclusionCategoryPresets,
  exclusionCategorySchema,
  expenseCategoryPresets,
  incomeCategoryPresets,
  isExclusionCategoryName,
} from "./category-presets.ts";
import { transactionKindSchema } from "./transactions.ts";

test("the category catalog preserves the existing presets and adds typed fallbacks", () => {
  assert.equal(expenseCategoryPresets.length, 20);
  assert.deepEqual(
    exclusionCategoryPresets.map(({ name }) => name),
    ["Repayment", "Internal", "Reimbursed", "Investment", "One-off", "Cancelled", "Misc"],
  );
  const slugs = [
    ...expenseCategoryPresets,
    ...incomeCategoryPresets,
    ...exclusionCategoryPresets,
  ].map(({ slug }) => slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const category of exclusionCategoryPresets) {
    assert.equal(exclusionCategorySchema.parse(category.slug), category.slug);
    assert.equal(isExclusionCategoryName(category.name), category.slug !== "misc-exclusion");
  }
  assert.equal(isExclusionCategoryName(" internal "), true);
  assert.equal(isExclusionCategoryName("REIMBURSED"), true);
  assert.equal(isExclusionCategoryName("Unknown"), false);
  assert.equal(isExclusionCategoryName(null), false);
  assert.deepEqual(
    exclusionCategoryPresets.filter(({ automated }) => automated).map(({ slug }) => slug),
    ["internal", "misc-exclusion"],
  );
  assert.deepEqual(
    [expenseCategoryPresets, incomeCategoryPresets, exclusionCategoryPresets].map((presets) =>
      presets.filter(({ name }) => name === "Misc").map(({ slug }) => slug),
    ),
    [["misc"], ["misc-income"], ["misc-exclusion"]],
  );
  assert.deepEqual(
    [expenseCategoryPresets, incomeCategoryPresets].map((presets) =>
      presets.filter(({ name }) => name === "Person").map(({ slug }) => slug),
    ),
    [["person"], ["person-income"]],
  );
  assert.equal(
    incomeCategoryPresets.find(({ slug }) => slug === "other-income").name,
    "Other Income",
  );
});

test("shared fallback labels never imply exclusion without a typed identity", () => {
  for (const name of ["Misc", " MISC ", "misc", "Person", "Other Income"]) {
    assert.equal(isExclusionCategoryName(name), false);
  }
  assert.equal(isExclusionCategoryName("Internal"), true);
  assert.equal(exclusionCategorySchema.parse("misc-exclusion"), "misc-exclusion");
  assert.equal(exclusionCategorySchema.safeParse("misc").success, false);
  assert.equal(exclusionCategorySchema.safeParse("misc-income").success, false);
  assert.equal(exclusionCategorySchema.safeParse("person").success, false);
  assert.equal(exclusionCategorySchema.safeParse("person-income").success, false);
});

test("the stored ledger has exclusion as a type and no transfer", () => {
  assert.equal(transactionKindSchema.parse("exclusion"), "exclusion");
  assert.equal(transactionKindSchema.safeParse("transfer").success, false);
});

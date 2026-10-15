import assert from "node:assert/strict";
import test from "node:test";
import { categoryIconChoices, chosenCategoryIcon } from "../apps/web/src/data/category-icons.ts";

test("user-selected category icons override automatic meaning and unknown selections fall back safely", () => {
  assert.equal(chosenCategoryIcon("Rent"), "home");
  assert.equal(chosenCategoryIcon("Rent", "heart"), "heart");
  assert.equal(chosenCategoryIcon("Rent", "unknown-external-icon"), "home");
  assert.equal(chosenCategoryIcon("My own category"), "dot");
  assert.equal(chosenCategoryIcon("__proto__", "constructor"), "dot");
  assert.equal(chosenCategoryIcon("Food & Drinks", null), "food");
  assert.equal(chosenCategoryIcon("My own category", "book"), "book");
  assert.equal(
    new Set(categoryIconChoices.map((choice) => choice.id)).size,
    categoryIconChoices.length,
  );
});

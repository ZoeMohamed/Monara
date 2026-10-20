import assert from "node:assert/strict";
import { it } from "node:test";
import { demoEditorCategories, demoTransactionSelection } from "../../data/demo-resources.ts";

it("keeps Person and Misc identities distinct when display names are shared", () => {
  const categories = demoEditorCategories([]);
  const persons = categories.filter((category) => category.name === "Person");
  assert.deepEqual(persons.map((category) => category.kind).sort(), ["expense", "income"]);
  assert.equal(new Set(persons.map((category) => category.id)).size, 2);

  const misc = categories.filter((category) => category.name === "Misc");
  assert.deepEqual(misc.map((category) => category.kind).sort(), [
    "exclusion",
    "expense",
    "income",
  ]);
  assert.equal(new Set(misc.map((category) => category.id)).size, 3);
  for (const category of misc) {
    const selection = demoTransactionSelection(
      { kind: category.kind, method: null, category: category.id },
      { financialAccounts: [], categories },
    );
    assert.equal(selection.categoryKind, category.kind);
    assert.equal(selection.category, "Misc");
    assert.equal(selection.categoryId, category.id);
  }
});

it("keeps budget categories as expenses when an income category shares the name", () => {
  const categories = demoEditorCategories([{ category: "Salary", icon: "home" }]);
  const salary = categories.filter((category) => category.name === "Salary");
  assert.deepEqual(salary.map((category) => category.kind).sort(), ["expense", "income"]);
  assert.equal(salary.find((category) => category.kind === "expense").icon, "home");
  assert.equal(salary.find((category) => category.kind === "income").icon, "income");
});

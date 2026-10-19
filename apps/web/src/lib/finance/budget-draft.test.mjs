import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import ts from "typescript";
import { budgetCategoryError, budgetDraftOf, rebaseBudgetDraft } from "./budget-draft.ts";
import { FinanceClientError } from "./client.ts";

const managerUrl = new URL("../../components/budget-manager.tsx", import.meta.url).href;
const uiSource = `
export const Button = null, FieldError = null, Input = null, Label = null, ListBox = null, ProgressBar = null, Select = null, Switch = null, TextField = null, useAmountDisplay = () => ({ formatRupiah: () => "" }), BudgetDetails = null, useBudgetDraftSessions = () => ({ sessions: {}, keep: () => {}, forget: () => {} }), BudgetSuggestionPanel = null, CategoryCreator = null, CategoryAvatar = null, Icon = null, ModalDialog = null;
`;
const reactSource = `export const useState = () => [null, () => {}], useRef = () => ({ current: null }), useEffect = () => {}, Fragment = null, createElement = () => null;`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== managerUrl) return nextResolve(specifier, context);
    if (specifier === "react")
      return { url: `data:text/javascript,${encodeURIComponent(reactSource)}`, shortCircuit: true };
    if (specifier === "react/jsx-runtime")
      return {
        url: "data:text/javascript,export const jsx = () => null, jsxs = () => null, Fragment = null;",
        shortCircuit: true,
      };
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    if (specifier === "@monara/ui" || specifier.startsWith("@/components/"))
      return { url: `data:text/javascript,${encodeURIComponent(uiSource)}`, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== managerUrl) return nextLoad(url, context);
    const source = `${readFileSync(new URL(url), "utf8")}\nexport { budgetSaveFailure, retainedBudgetDialogKey, retainedEditorState };`;
    const result = ts.transpileModule(source, {
      fileName: "budget-manager.tsx",
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  },
});

const { budgetSaveFailure, retainedBudgetDialogKey, retainedEditorState } = await import(
  managerUrl
);

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
  it("defaults a new budget to the selected period while existing settings and retained requests win", () => {
    assert.equal(
      retainedEditorState(undefined, undefined, "2026-10-19", "weekly").draft.cadence,
      "weekly",
    );
    assert.equal(retainedEditorState(undefined, undefined, "2026-10-19").draft.cadence, "monthly");
    assert.equal(
      retainedEditorState(undefined, saved, "2026-10-19", "weekly").draft.cadence,
      "monthly",
    );
    const draft = budgetDraftOf(saved, "2026-10-19");
    const request = {
      operation: "create_budget",
      input: { clientRequestId: "synthetic-retained-monthly-request" },
      values: draft,
      priorIds: new Set(),
    };
    const recovered = {
      draft,
      request,
      uncertain: true,
      pending: false,
      conflict: false,
      error: null,
    };
    const resumed = retainedEditorState(recovered, undefined, "2026-10-19", "weekly");
    assert.equal(resumed.draft, draft);
    assert.equal(resumed.draft.cadence, "monthly");
    assert.equal(resumed.submittedRequest, request);
    assert.equal(resumed.uncertain, true);
  });

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
    assert.equal(budgetCategoryError([{ ...category, name: "Internal" }], category.id), null);
  });

  it("treats generic errors as uncertain to preserve request identity and draft across retry", () => {
    const generic = new Error("Network connection dropped");
    const failure = budgetSaveFailure(generic, false, false);
    assert.equal(failure.pending, false);
    assert.equal(failure.uncertain, true);
    assert.equal(failure.conflict, false);
    assert.match(failure.error, /We couldn’t check this save/);
  });

  it("distinguishes known client errors that have not completed from uncertain failures", () => {
    const badInput = new FinanceClientError(
      "VALIDATION_FAILED",
      "Limit must be positive.",
      400,
      false,
    );
    const failure = budgetSaveFailure(badInput, false, false);
    assert.equal(failure.pending, false);
    assert.equal(failure.uncertain, false);
    assert.equal(failure.conflict, false);
    assert.equal(failure.error, "Limit must be positive.");
  });

  it("marks known errors with actionMayHaveCompleted as uncertain", () => {
    const timeout = new FinanceClientError("INTERNAL", "Gateway timeout", 504, true);
    const failure = budgetSaveFailure(timeout, true, false);
    assert.equal(failure.pending, false);
    assert.equal(failure.uncertain, true);
    assert.equal(failure.conflict, false);
  });

  it("marks conflict when editing a changed budget record", () => {
    const conflictErr = new FinanceClientError(
      "CONFLICT",
      "Budget was modified by another session",
      409,
      false,
    );
    const failure = budgetSaveFailure(conflictErr, true, false);
    assert.equal(failure.conflict, true);
    assert.equal(failure.uncertain, false);
    assert.equal(failure.error, "Budget was modified by another session");
  });

  it("does not mark conflict when creating a new budget", () => {
    const conflictErr = new FinanceClientError("CONFLICT", "Conflict error", 409, false);
    const failure = budgetSaveFailure(conflictErr, false, false);
    assert.equal(failure.conflict, false);
  });

  it("maintains uncertain state across subsequent errors so request UUID is preserved", () => {
    const followUpErr = new FinanceClientError("INTERNAL", "Server error", 500, false);
    const failure = budgetSaveFailure(followUpErr, true, true);
    assert.equal(failure.uncertain, true);
  });

  it("uses stable dialog keys that never remount on pending transitions", () => {
    assert.equal(retainedBudgetDialogKey({ kind: "create" }), "create:new");
    assert.equal(retainedBudgetDialogKey({ kind: "edit", id: "budget-123" }), "edit:budget-123");
    assert.equal(
      retainedBudgetDialogKey({ kind: "delete", id: "budget-123" }),
      "delete:budget-123",
    );
    assert.equal(retainedBudgetDialogKey(null), "closed");
  });
});

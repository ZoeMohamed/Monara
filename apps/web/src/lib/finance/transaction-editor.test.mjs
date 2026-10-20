import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, describe, it } from "node:test";
import { transactionSchema, updateTransactionInputSchema } from "@monara/contracts";
import ts from "typescript";
import { mapOwnedTransaction } from "./presentation.ts";

const editorUrl = new URL("../../components/transaction-editor.tsx", import.meta.url).href;
const fieldsUrl = new URL("../../components/quick-add-fields.tsx", import.meta.url).href;
const runtimeKey = Symbol.for("monara.transaction-editor-test");
const reactSource = `
  const runtime = () => globalThis[Symbol.for("monara.transaction-editor-test")];
  export const useReducer = (...args) => runtime().useReducer(...args);
  export const useState = (...args) => runtime().useState(...args);
  export const useRef = (...args) => runtime().useRef(...args);
  export const useEffect = (...args) => runtime().useEffect(...args);
  export const useId = () => "field-error";
`;
const uiSource = `export const Button = null, FieldError = null, Form = null,
  Input = null, Label = null, ListBox = null, Select = null, TextField = null,
  BrandLogoField = null, FinanceRecovery = null, CategoryAvatar = null,
  Icon = null, ModalDialog = null, QuickAddFields = null, AccountBadge = null,
  BrandMark = null, useMerchantLogo = () => null;`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== editorUrl && context.parentURL !== fieldsUrl)
      return nextResolve(specifier, context);
    if (specifier === "react") {
      return { url: `data:text/javascript,${encodeURIComponent(reactSource)}`, shortCircuit: true };
    }
    if (specifier === "react/jsx-runtime") {
      return {
        url: "data:text/javascript,export const jsx = (type, props) => ({ type, props }), jsxs = jsx, Fragment = null;",
        shortCircuit: true,
      };
    }
    if (specifier === "@monara/ui" || specifier.startsWith("@/components/")) {
      return { url: `data:text/javascript,${encodeURIComponent(uiSource)}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== editorUrl && url !== fieldsUrl) return nextLoad(url, context);
    // Inspect the actual private hook without adding a production export or JSX
    // renderer. TypeScript only erases types/JSX; the hook logic is unchanged.
    const exports =
      url === editorUrl
        ? "useTransactionEditorState as useEditorStateForTest, kindChange as kindChangeForTest, quickCategoryChoices as categoryChoicesForTest"
        : "amountInput, groupedAmount";
    const source = `${readFileSync(new URL(url), "utf8")}\nexport { ${exports} };`;
    const result = ts.transpileModule(source, {
      fileName: "transaction-editor.tsx",
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  },
});
const { useEditorStateForTest, kindChangeForTest, categoryChoicesForTest } = await import(
  editorUrl
);
const { amountInput, groupedAmount } = await import(fieldsUrl);
hooks.deregister();

const originalDomGlobals = new Map(
  ["SubmitEvent", "HTMLButtonElement"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);
for (const name of originalDomGlobals.keys()) {
  Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { addEventListener() {}, removeEventListener() {} },
});
after(() => {
  for (const [name, descriptor] of originalDomGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  delete globalThis[runtimeKey];
});

const accountId = "00000000-0000-4000-8000-000000000101";
const categoryId = "00000000-0000-4000-8000-000000000201";
const originalVersion = "2026-10-17T10:00:00Z";
const latestVersion = "2026-10-17T10:01:00Z";
const resources = {
  financialAccounts: [{ id: accountId, name: "Daily bank", isActive: true }],
  categories: [{ id: categoryId, name: "Resto & Cafe", kind: "expense", isArchived: false }],
};

function transaction(version = originalVersion, merchant = "Original lunch", amount = 25000) {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    merchant,
    amount,
    date: "2026-10-17",
    time: null,
    kind: "expense",
    currency: "IDR",
    status: "confirmed",
    method: "Daily bank",
    category: "Resto & Cafe",
    backend: {
      merchantName: merchant,
      categoryId,
      financialAccountId: accountId,
      updatedAt: version,
    },
  };
}

function mountEditor(overrides = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const saved = [];
  const draftChanges = [];
  const closes = [];
  const props = {
    transaction: transaction(),
    resources: structuredClone(resources),
    today: "2026-10-17",
    onSave: (...args) => {
      saved.push(args);
    },
    onDraftChange: (draft) => {
      draftChanges.push(draft);
    },
    onClose: (preserve) => {
      closes.push(preserve);
    },
    ...overrides,
  };
  const same = (before, after) =>
    before?.length === after?.length &&
    before.every((value, index) => Object.is(value, after[index]));
  const runtime = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        slots[index].value,
        (next) => {
          slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
        },
      ];
    },
    useReducer(reducer, initial, initialize) {
      const index = cursor++;
      slots[index] ??= { value: initialize ? initialize(initial) : initial };
      return [
        slots[index].value,
        (action) => {
          slots[index].value = reducer(slots[index].value, action);
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (same(slots[index]?.dependencies, dependencies)) return;
      effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { dependencies, cleanup: effect() };
      });
    },
  };
  const useRenderEditor = () => {
    cursor = 0;
    effects = [];
    globalThis[runtimeKey] = runtime;
    const current = useEditorStateForTest(props);
    for (const effect of effects) effect();
    return current;
  };
  return { props, saved, closes, draftChanges, render: useRenderEditor };
}

function submitEvent(action) {
  const focused = [];
  const nativeEvent = action ? new SubmitEvent() : {};
  if (action) nativeEvent.submitter = Object.assign(new HTMLButtonElement(), { value: action });
  return {
    focused,
    nativeEvent,
    preventDefault() {},
    currentTarget: {
      querySelector(selector) {
        return {
          focus() {
            focused.push(selector);
          },
        };
      },
    },
  };
}

describe("transaction editor recovery", () => {
  it("saves an unknown pending type while preserving its owned category hint", async () => {
    const original = transaction();
    const editor = mountEditor({
      transaction: {
        ...original,
        kind: null,
        status: "pending",
        backend: { ...original.backend, kind: null },
      },
    });
    editor.render().changeDraft({ merchant: "Corrected evidence" });
    await editor.render().submit(submitEvent("edit"));
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].kind, null);
    assert.equal(editor.saved[0][0].categoryId, categoryId);
    assert.equal(editor.saved[0][1], "edit");
    assert.equal(editor.render().state.errors.category, undefined);
  });

  it("preserves an unchanged archived owned hint on pending edit, while rejecting changed or conflicting hints", async () => {
    const original = transaction();
    const archived = structuredClone(resources);
    archived.categories[0].isArchived = true;
    const pending = {
      ...original,
      kind: null,
      status: "pending",
      backend: { ...original.backend, kind: null },
    };
    const editor = mountEditor({ resources: archived, transaction: pending });
    await editor.render().submit(submitEvent("edit"));
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].categoryId, categoryId);

    for (const changes of [
      { kind: "income" },
      { category: "00000000-0000-4000-8000-000000000299" },
    ]) {
      const unavailable = structuredClone(archived);
      unavailable.categories.push({
        ...unavailable.categories[0],
        id: "00000000-0000-4000-8000-000000000299",
      });
      const invalid = mountEditor({ resources: unavailable, transaction: pending });
      invalid.render().changeDraft(changes);
      await invalid.render().submit(submitEvent("edit"));
      assert.equal(invalid.saved.length, 0);
      assert.match(invalid.render().state.errors.category, /available category/);
    }
  });

  it("shows the existing hint before type selection and clears it only for a conflicting type", () => {
    const draft = { kind: null, category: categoryId };
    assert.deepEqual(
      categoryChoicesForTest(draft, resources).map((option) => option.id),
      [categoryId],
    );
    assert.deepEqual(kindChangeForTest(draft, null, resources), {
      kind: null,
      category: categoryId,
    });
    assert.deepEqual(kindChangeForTest(draft, "Expense", resources), {
      kind: "expense",
      category: categoryId,
    });
    assert.deepEqual(kindChangeForTest(draft, "Income", resources), {
      kind: "income",
      category: null,
    });
  });

  it("still rejects an unowned category hint on an unknown pending type", async () => {
    const original = transaction();
    const editor = mountEditor({
      resources: { ...resources, categories: [] },
      transaction: {
        ...original,
        kind: null,
        status: "pending",
        backend: { ...original.backend, kind: null },
      },
    });
    await editor.render().submit(submitEvent("edit"));
    assert.equal(editor.saved.length, 0);
    assert.match(editor.render().state.errors.category, /available category/);
  });

  it("starts a new transaction on the first active account", () => {
    const editor = mountEditor({
      transaction: undefined,
      resources: {
        ...structuredClone(resources),
        financialAccounts: [
          { id: "00000000-0000-4000-8000-000000000999", name: "Closed", isActive: false },
          ...structuredClone(resources).financialAccounts,
        ],
      },
    });
    assert.equal(editor.render().state.draft.method, accountId);
  });

  it("requires an account before submitting a new live manual exclusion", async () => {
    const editor = mountEditor({
      transaction: undefined,
      resources: { ...structuredClone(resources), financialAccounts: [] },
      initialDraft: {
        merchant: "My wallet transfer",
        amount: "25000",
        date: "2026-10-17",
        time: "",
        kind: "exclusion",
        currency: "IDR",
        category: null,
        method: null,
      },
    });
    const event = submitEvent();
    await editor.render().submit(event);
    assert.equal(editor.saved.length, 0);
    assert.equal(editor.render().state.errors.method, "Choose an account.");
    assert.match(event.focused[0], /data-field="method"/);
  });

  it("allows reviewing an existing pending exclusion without an assigned account", async () => {
    const original = transaction();
    const editor = mountEditor({
      transaction: {
        ...original,
        kind: "exclusion",
        status: "pending",
        category: null,
        method: null,
        backend: { ...original.backend, categoryId: null, financialAccountId: null },
      },
    });
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].financialAccountId, null);
    assert.equal(editor.saved[0][1], "confirm");
  });

  it("rejects an incompatible typed category even when its name looks like an expense", async () => {
    const incompatible = structuredClone(resources);
    incompatible.categories[0].kind = "income";
    const editor = mountEditor({ resources: incompatible });
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved.length, 0);
    assert.match(editor.render().state.errors.category, /matching this transaction type/);
  });

  it("keeps a live exclusion's canonical category id when opening the editor", () => {
    const exclusions = structuredClone(resources);
    exclusions.categories[0].kind = "exclusion";
    exclusions.categories[0].name = "My transfer";
    const original = { ...transaction(), kind: "exclusion", category: "My transfer" };
    const editor = mountEditor({ resources: exclusions, transaction: original });
    assert.equal(editor.render().state.draft.category, categoryId);
  });

  it("round-trips SQL seconds through a compact display and an unrelated edit without inventing time", async () => {
    for (const occurredTime of ["12:00:00", "12:34:56", "00:00:00", null]) {
      const source = transactionSchema.parse({
        id: transaction().id,
        kind: "expense",
        flowDirection: "out",
        merchantName: "Original lunch",
        money: { amountMinor: "25000", currency: "IDR" },
        occurredOn: "2026-10-17",
        occurredTime,
        description: null,
        location: null,
        accountHint: null,
        categoryId,
        financialAccountId: accountId,
        reviewStatus: "confirmed",
        source: "gmail_email",
        confidence: 0.96,
        deletedAt: null,
        createdAt: originalVersion,
        updatedAt: originalVersion,
      });
      const mapped = mapOwnedTransaction(source, resources.financialAccounts, resources.categories);
      assert.equal(mapped.time, occurredTime?.slice(0, 5) ?? null);
      const editor = mountEditor({ transaction: mapped });
      editor.render().changeDraft({ merchant: "Corrected lunch" });
      await editor.render().submit(submitEvent());
      assert.equal(editor.saved.length, 1);
      const [values, action, expectedUpdatedAt] = editor.saved[0];
      assert.equal(action, "correct");
      assert.equal(values.time, occurredTime);
      const request = updateTransactionInputSchema.parse({
        transactionId: source.id,
        expectedUpdatedAt,
        changes: { merchantName: values.merchant, occurredTime: values.time },
      });
      assert.equal(request.changes.occurredTime, occurredTime);
    }
  });

  it("blocks a changed record until the user reviews it, then preserves their draft explicitly", async () => {
    const editor = mountEditor();
    editor.render().changeDraft({ merchant: "My corrected lunch", amount: "30000" });
    editor.props.transaction = transaction(latestVersion, "Updated elsewhere", 28000);
    const conflicted = editor.render();
    assert.equal(conflicted.changedElsewhere, true);
    assert.equal(conflicted.state.draft.merchant, "My corrected lunch");
    await conflicted.submit(submitEvent());
    assert.equal(editor.saved.length, 0);

    conflicted.reviewLatest(false);
    const reviewed = editor.render();
    assert.equal(reviewed.changedElsewhere, false);
    assert.equal(reviewed.state.draft.merchant, "My corrected lunch");
    assert.equal(reviewed.state.draft.amount, "30000");
    assert.equal(reviewed.state.draft.reviewedUpdatedAt, latestVersion);
    await reviewed.submit(submitEvent());
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].merchant, "My corrected lunch");
    assert.equal(editor.saved[0][0].amount, 30000);
    assert.equal(editor.saved[0][2], latestVersion);
  });

  it("uses the latest saved values only after the user chooses them", () => {
    const editor = mountEditor();
    editor.render().changeDraft({ merchant: "My draft", amount: "30000" });
    editor.props.transaction = transaction(latestVersion, "Updated elsewhere", 28000);
    editor.render().reviewLatest(true);
    const reviewed = editor.render();
    assert.equal(reviewed.changedElsewhere, false);
    assert.equal(reviewed.state.draft.merchant, "Updated elsewhere");
    assert.equal(reviewed.state.draft.amount, "28000");
    assert.equal(reviewed.state.draft.reviewedUpdatedAt, latestVersion);
    assert.equal(editor.saved.length, 0);
    assert.deepEqual(editor.draftChanges.at(-1), reviewed.state.draft);
  });

  it("locks a reopened uncertain create and preserves it on close", () => {
    const editor = mountEditor({
      transaction: undefined,
      initialUncertain: true,
      initialDraft: {
        merchant: "Submitted lunch",
        amount: "25000",
        date: "2026-10-17",
        time: "",
        kind: "expense",
        currency: "IDR",
        category: categoryId,
        method: accountId,
      },
    });
    editor.render().changeDraft({ merchant: "A different lunch", amount: "26000" });
    assert.equal(editor.render().state.draft.merchant, "Submitted lunch");
    assert.equal(editor.render().state.draft.amount, "25000");
    assert.equal(editor.draftChanges.length, 0);
    editor.render().requestClose();
    assert.deepEqual(editor.closes, [true]);
  });

  it("focuses an inactive account or archived category before sending a save", async () => {
    for (const field of ["method", "category"]) {
      const unavailable = structuredClone(resources);
      if (field === "method") unavailable.financialAccounts[0].isActive = false;
      else unavailable.categories[0].isArchived = true;
      const editor = mountEditor({ resources: unavailable });
      const event = submitEvent();
      await editor.render().submit(event);
      assert.equal(editor.saved.length, 0);
      assert.match(
        editor.render().state.errors[field],
        field === "method" ? /active account/ : /archived or removed/,
      );
      assert.equal(event.focused.length, 1);
      assert.match(event.focused[0], new RegExp(`data-field="${field}"`));
      assert.equal(editor.render().state.phase, "editing");
    }
  });
});

describe("live exclusion editor", () => {
  it("keeps a live reason as its owned UUID and saves an exclusion without an account", async () => {
    const item = transaction();
    item.kind = "exclusion";
    item.status = "pending";
    item.category = "Internal";
    item.method = null;
    item.backend.financialAccountId = null;
    const editor = mountEditor({
      transaction: item,
      resources: {
        financialAccounts: [],
        categories: [
          { id: categoryId, name: "My own accounts", kind: "exclusion", isArchived: false },
        ],
      },
    });
    assert.equal(editor.render().state.draft.category, categoryId);
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].kind, "exclusion");
    assert.equal(editor.saved[0][0].categoryId, categoryId);
    assert.equal(editor.saved[0][0].financialAccountId, null);
  });

  it("blocks an archived exclusion reason and keeps the entered details", async () => {
    const item = transaction();
    item.kind = "exclusion";
    const editor = mountEditor({
      transaction: item,
      resources: {
        ...resources,
        categories: [{ id: categoryId, name: "Internal", kind: "exclusion", isArchived: true }],
      },
    });
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved.length, 0);
    assert.match(editor.render().state.errors.category, /archived or removed/);
    assert.equal(editor.render().state.draft.category, categoryId);
  });
});

describe("USD amount editing", () => {
  it("saves a trailing decimal as whole dollars without losing the currency", async () => {
    const editor = mountEditor({
      transaction: { ...transaction(), currency: "USD", amount: 1999 },
    });
    editor.render().changeDraft({ amount: "19." });
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].amount, 1900);
    assert.equal(editor.saved[0][0].currency, "USD");
  });

  it("preserves fractional dollar entry and grouping in the shared amount field", () => {
    assert.equal(amountInput("19.99", "USD"), "19.99");
    assert.equal(amountInput("1,234.50", "USD"), "1234.50");
    assert.equal(amountInput(".01", "USD"), "0.01");
    assert.equal(amountInput("0.", "USD"), "0.");
    assert.equal(amountInput("", "USD"), "");
    assert.equal(amountInput("19.999", "USD"), null);
    assert.equal(amountInput("-19.99", "USD"), null);
    assert.equal(groupedAmount("1234.50"), "1,234.50");
    assert.equal(groupedAmount("0."), "0.");
    assert.equal(amountInput("330,000", "IDR"), "330000");
  });

  it("allows editing a pending USD import before conversion is available", async () => {
    const source = {
      ...transaction(),
      status: "pending",
      currency: "USD",
      amount: 1999,
      reportingAmount: null,
    };
    const editor = mountEditor({ transaction: source });
    await editor.render().submit(submitEvent("edit"));
    assert.equal(editor.saved.length, 1);
    assert.equal(editor.saved[0][0].amount, 1999);
    assert.equal(editor.saved[0][0].currency, "USD");
    assert.equal(editor.saved[0][1], "edit");
  });

  it("shows cents as dollars and saves the exact original currency and minor units", async () => {
    const source = { ...transaction(), currency: "USD", amount: 1999, reportingAmount: 329837 };
    const editor = mountEditor({ transaction: source });
    assert.equal(editor.render().state.draft.amount, "19.99");
    await editor.render().submit(submitEvent());
    assert.equal(editor.saved[0][0].amount, 1999);
    assert.equal(editor.saved[0][0].currency, "USD");
  });
});

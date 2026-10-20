import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, describe, it } from "node:test";

import { FinanceClientError } from "./client.ts";

const runtimeKey = Symbol.for("monara.transaction-actions-test");
const reactSource = `
  export const useRef = (...args) =>
    globalThis[Symbol.for("monara.transaction-actions-test")].useRef(...args);
  export const useState = (...args) =>
    globalThis[Symbol.for("monara.transaction-actions-test")].useState(...args);
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/components/transaction-actions.ts")) {
      if (specifier === "react") {
        return {
          url: `data:text/javascript,${encodeURIComponent(reactSource)}`,
          shortCircuit: true,
        };
      }
      if (specifier === "@/lib/finance/client") {
        return nextResolve(new URL("./client.ts", import.meta.url).href, context);
      }
      if (specifier === "@/data/demo-ledger") {
        return nextResolve(new URL("../../data/demo-ledger.ts", import.meta.url).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
const { useTransactionActions } = await import("../../components/transaction-actions.ts");
hooks.deregister();

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  delete globalThis[runtimeKey];
});

const accountId = "00000000-0000-4000-8000-000000000101";
const categoryId = "00000000-0000-4000-8000-000000000201";
const transactionId = "00000000-0000-4000-8000-000000000301";
const actionId = "00000000-0000-4000-8000-000000000501";
const reviewedVersion = "2026-10-17T10:00:00Z";
const latestVersion = "2026-10-17T10:01:00Z";
const editorKey = "new:2026-10";

const values = {
  merchant: "Synthetic lunch",
  category: "Resto & Cafe",
  categoryId,
  amount: 25000,
  currency: "IDR",
  date: "2026-10-17",
  time: null,
  method: "Daily bank",
  financialAccountId: accountId,
  kind: "expense",
};
const draft = {
  merchant: values.merchant,
  amount: String(values.amount),
  date: values.date,
  time: "",
  kind: values.kind,
  currency: values.currency,
  category: categoryId,
  method: accountId,
};
const receipt = {
  actionId,
  resourceType: "transaction",
  resourceId: transactionId,
  changedAt: latestVersion,
  undoExpiresAt: "2099-10-17T10:30:00Z",
};
const budgetBefore = {
  id: "budget-demo",
  category: "Ride-hail",
  cadence: "weekly",
  startsOn: "2026-10-12",
  limit: 200000,
  warningPercent: 80,
  icon: "car",
};

function backendTransaction() {
  return {
    id: transactionId,
    kind: values.kind,
    merchantName: values.merchant,
    money: { amountMinor: String(values.amount), currency: "IDR" },
    occurredOn: values.date,
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId,
    financialAccountId: accountId,
    reviewStatus: "confirmed",
    source: "manual_form",
    confidence: null,
    deletedAt: null,
    createdAt: reviewedVersion,
    updatedAt: latestVersion,
  };
}

function mountActions(respond, categoryKind = "expense", categoryArchived = false) {
  const references = [];
  let cursor = 0;
  const requests = [];
  const navigations = [];
  const state = {
    live: true,
    transactions: [],
    budgets: [],
    restoredBudgets: [],
    notices: [],
    editing: undefined,
    rejecting: undefined,
    resources: {
      financialAccounts: [{ id: accountId }],
      categories: [{ id: categoryId, kind: categoryKind, isArchived: categoryArchived }],
    },
    notice: null,
    drafts: { [editorKey]: structuredClone(draft) },
    view: { adding: true, transactionId: null },
    mutationCalls: 0,
    closed: 0,
  };
  const setter = (field) => (next) => {
    state[field] = typeof next === "function" ? next(state[field]) : next;
    if (field === "notice") state.notices.push(state[field]);
  };
  const runtime = {
    useState(initial) {
      const index = cursor++;
      references[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        references[index].value,
        (next) => {
          references[index].value =
            typeof next === "function" ? next(references[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      references[index] ??= { current: initial };
      return references[index];
    },
  };
  globalThis.fetch = async (path, options) => {
    const input = JSON.parse(options.body);
    requests.push({ path, input });
    return respond(path, input, requests.length);
  };
  const useRenderActions = () => {
    cursor = 0;
    globalThis[runtimeKey] = runtime;
    return useTransactionActions({
      live: state.live,
      budgets: state.budgets,
      restoreDemoBudget(before, categoryIcon) {
        state.restoredBudgets.push({ before, categoryIcon });
        state.budgets = state.budgets.map((budget) => (budget.id === before.id ? before : budget));
      },
      resources: state.resources,
      transactions: state.transactions,
      editing: state.editing,
      rejecting: state.rejecting,
      editorKey,
      async mutate(operation) {
        state.mutationCalls += 1;
        return operation();
      },
      navigation: {
        view: state.view,
        navigate(patch, mode) {
          navigations.push({ patch, mode });
          state.view = { ...state.view, ...patch };
        },
        openEdit(id) {
          state.openedEdit = id;
        },
        closePopup() {
          state.closed += 1;
          state.view = { ...state.view, adding: false };
        },
      },
      notice: state.notice,
      setNotice: setter("notice"),
      setDrafts: setter("drafts"),
      setTransactions: setter("transactions"),
      setRemovedId: setter("removedId"),
      setBills: setter("bills"),
      setConfirmError: setter("confirmError"),
      setRejectError: setter("rejectError"),
    });
  };
  return { render: useRenderActions, requests, navigations, state };
}

describe("transaction action recovery", () => {
  it("preserves stated cash direction when a pending edit leaves the type unknown", async () => {
    for (const flowDirection of ["in", "out"]) {
      const original = {
        ...backendTransaction(),
        kind: null,
        flowDirection,
        reviewStatus: "pending",
      };
      const actions = mountActions(async (_path, input) =>
        Response.json({ transaction: { ...original, ...input.changes }, action: receipt }),
      );
      actions.state.editing = {
        ...values,
        kind: null,
        id: transactionId,
        status: "pending",
        backend: original,
      };
      await actions.render().save({ ...values, kind: null }, "edit", reviewedVersion);
      assert.equal(actions.requests[0].input.changes.kind, null);
      assert.equal(actions.requests[0].input.changes.flowDirection, flowDirection);
    }
  });

  it("preserves an owned category hint when editing a live unknown-type pending row", async () => {
    const original = { ...backendTransaction(), kind: null, reviewStatus: "pending" };
    const actions = mountActions(async (_path, input) =>
      Response.json({ transaction: { ...original, ...input.changes }, action: receipt }),
    );
    actions.state.editing = {
      ...values,
      kind: null,
      id: transactionId,
      status: "pending",
      backend: original,
    };
    await actions
      .render()
      .save({ ...values, kind: null, merchant: "Corrected evidence" }, "edit", reviewedVersion);
    assert.equal(actions.requests[0].path, "/api/finance/operations/edit_pending");
    assert.equal(actions.requests[0].input.changes.kind, null);
    assert.equal(actions.requests[0].input.changes.categoryId, categoryId);
    assert.equal(actions.requests[0].input.changes.flowDirection, null);
    assert.equal(actions.requests[0].input.expectedUpdatedAt, reviewedVersion);
  });

  it("keeps unchanged archived hints during pending edit but rejects changed archived hints", async () => {
    const original = { ...backendTransaction(), kind: null, reviewStatus: "pending" };
    const actions = mountActions(
      async (_path, input) =>
        Response.json({ transaction: { ...original, ...input.changes }, action: receipt }),
      "expense",
      true,
    );
    actions.state.editing = {
      ...values,
      kind: null,
      id: transactionId,
      status: "pending",
      backend: original,
    };
    await actions.render().save({ ...values, kind: null }, "edit", reviewedVersion);
    assert.equal(actions.requests[0].input.changes.categoryId, categoryId);
    actions.state.editing.backend = { ...original, categoryId: null };
    await assert.rejects(
      actions.render().save({ ...values, kind: null }, "edit", reviewedVersion),
      (error) => error.code === "VALIDATION_FAILED",
    );
    assert.equal(actions.requests.length, 1);
  });

  it("rejects unowned unknown-type hints and known-type conflicts before pending-edit transport", async () => {
    const actions = mountActions(async () => {
      throw new Error("Must not be called");
    });
    actions.state.editing = {
      ...values,
      kind: null,
      id: transactionId,
      status: "pending",
      backend: { ...backendTransaction(), kind: null, reviewStatus: "pending" },
    };
    for (const changes of [
      { kind: null, categoryId: "00000000-0000-4000-8000-000000000999" },
      { kind: "income" },
    ]) {
      await assert.rejects(
        actions.render().save({ ...values, ...changes }, "edit", reviewedVersion),
        (error) => error.code === "VALIDATION_FAILED",
      );
    }
    assert.equal(actions.requests.length, 0);
  });

  it("edits a live exclusion and preserves the imported cash direction", async () => {
    const original = { ...backendTransaction(), kind: "exclusion", flowDirection: "out" };
    const actions = mountActions(
      async (_path, input) =>
        Response.json({
          transaction: { ...original, ...input.changes },
          action: receipt,
        }),
      "exclusion",
    );
    actions.state.editing = {
      ...values,
      kind: "exclusion",
      id: transactionId,
      status: "confirmed",
      backend: original,
    };
    await actions
      .render()
      .save(
        { ...values, kind: "exclusion", merchant: "My own wallet" },
        "correct",
        reviewedVersion,
      );
    assert.equal(actions.requests[0].path, "/api/finance/operations/edit_transaction");
    assert.equal(actions.requests[0].input.changes.kind, "exclusion");
    assert.equal(actions.requests[0].input.changes.flowDirection, "out");
    assert.equal(actions.requests[0].input.expectedUpdatedAt, reviewedVersion);
  });

  it("confirms a live pending exclusion through the owned backend operation", async () => {
    const original = {
      ...backendTransaction(),
      kind: "exclusion",
      flowDirection: "in",
      reviewStatus: "pending",
    };
    const actions = mountActions(
      async (_path, input) =>
        Response.json({
          transaction: { ...original, ...input.values, reviewStatus: "confirmed" },
          action: receipt,
        }),
      "exclusion",
    );
    actions.state.transactions = [
      { ...values, kind: "exclusion", id: transactionId, status: "pending", backend: original },
    ];
    await actions.render().confirm(transactionId);
    assert.equal(actions.requests[0].path, "/api/finance/operations/confirm_pending");
    assert.equal(actions.requests[0].input.values.flowDirection, "in");
    assert.match(actions.state.notice.message, /exclusion/);
  });

  it("rejects a category of another type before transport", async () => {
    const actions = mountActions(async () => {
      throw new Error("Must not be called");
    }, "income");
    await assert.rejects(
      actions.render().add(values),
      (error) => error.code === "VALIDATION_FAILED",
    );
    assert.equal(actions.requests.length, 0);
  });

  it("keeps an uncertain create locked across closing and reuses its original request on retry", async () => {
    const savedByRequest = new Map();
    let physicalWrites = 0;
    const actions = mountActions(async (_path, input, requestNumber) => {
      if (!savedByRequest.has(input.clientRequestId)) {
        physicalWrites += 1;
        savedByRequest.set(input.clientRequestId, {
          transaction: backendTransaction(),
          action: receipt,
        });
      }
      if (requestNumber === 1) throw new TypeError("Reply lost after the server saved");
      return Response.json(savedByRequest.get(input.clientRequestId));
    });
    await assert.rejects(
      actions.render().add(values),
      (error) => error instanceof FinanceClientError && error.actionMayHaveCompleted,
    );
    assert.equal(actions.render().lockedCreate, true);
    actions.render().closeEditor();
    assert.equal(actions.state.closed, 1);
    assert.deepEqual(actions.state.drafts[editorKey], draft);
    assert.equal(actions.state.notice.recovery, "history");

    actions.state.view = { adding: true, transactionId: null };
    assert.equal(actions.render().lockedCreate, true);
    await actions.render().add(values);
    assert.equal(actions.requests.length, 2);
    assert.deepEqual(actions.requests[1].input, actions.requests[0].input);
    assert.equal(physicalWrites, 1);
    assert.equal(actions.render().lockedCreate, false);
    assert.equal(actions.state.drafts[editorKey], undefined);
    // The toast confirms the add and offers Undo, so the sheet closes instead of opening the record.
    assert.equal(actions.state.view.adding, false);
    assert.equal(actions.state.view.transactionId, null);
    assert.deepEqual(actions.state.notice.undo, { kind: "backend", receipt });
  });

  it("rejects an edited body for an unresolved create before making another request", async () => {
    const actions = mountActions(async () => {
      throw new TypeError("Connection lost");
    });
    await assert.rejects(actions.render().add(values), (error) => error.actionMayHaveCompleted);
    actions.render().closeEditor(true);
    actions.state.view = { adding: true, transactionId: null };
    await assert.rejects(
      actions.render().add({ ...values, amount: 26000 }),
      (error) => error.code === "CONFLICT" && error.actionMayHaveCompleted,
    );
    assert.equal(actions.requests.length, 1);
    assert.equal(actions.state.mutationCalls, 1);
    assert.equal(actions.render().lockedCreate, true);
    assert.deepEqual(actions.state.drafts[editorKey], draft);
  });

  it("sends the originally reviewed version after a refreshed record arrives, preserving the draft on conflict", async () => {
    const actions = mountActions(async () =>
      Response.json(
        {
          code: "CONFLICT",
          message: "This transaction changed.",
          requestId: null,
        },
        { status: 409 },
      ),
    );
    actions.state.editing = {
      ...values,
      id: transactionId,
      status: "confirmed",
      backend: backendTransaction(),
    };
    await assert.rejects(
      actions.render().save(values, "correct", reviewedVersion),
      (error) => error.code === "CONFLICT" && !error.actionMayHaveCompleted,
    );
    assert.equal(actions.requests[0].path, "/api/finance/operations/edit_transaction");
    assert.equal(actions.requests[0].input.expectedUpdatedAt, reviewedVersion);
    assert.notEqual(
      actions.requests[0].input.expectedUpdatedAt,
      actions.state.editing.backend.updatedAt,
    );
    assert.deepEqual(actions.state.drafts[editorKey], draft);
    assert.equal(actions.state.notice, null);
    assert.equal(actions.navigations.length, 0);
    actions.render().closeEditor(true);
    assert.deepEqual(actions.state.drafts[editorKey], draft);
  });

  it("uses the backend receipt for Undo and suppresses a second tap while it is saving", async () => {
    let resolve;
    const response = new Promise((done) => {
      resolve = done;
    });
    const actions = mountActions(() => response);
    actions.state.notice = { message: "Transaction added.", undo: { kind: "backend", receipt } };
    const current = actions.render();
    const first = current.undo();
    await current.undo();
    assert.equal(actions.requests.length, 1);
    assert.equal(actions.requests[0].path, "/api/finance/operations/undo_action");
    assert.deepEqual(actions.requests[0].input, { actionId });
    resolve(Response.json({ ok: true }));
    await first;
    assert.match(actions.state.notice.message, /Change undone/);
    assert.equal(actions.state.notice.undo, undefined);
  });

  it("offers a History recovery path when Undo has expired without dispatching a reversal", async () => {
    const actions = mountActions(async () => {
      throw new Error("Must not be called");
    });
    actions.state.notice = {
      message: "Transaction added.",
      undo: { kind: "backend", receipt: { ...receipt, undoExpiresAt: "2000-01-01T00:00:00Z" } },
    };
    await actions.render().undo();
    assert.equal(actions.requests.length, 0);
    assert.equal(actions.state.notice.tone, "warning");
    assert.equal(actions.state.notice.recovery, "history");
    assert.equal(actions.state.notice.undo, undefined);
  });
});

describe("shared budget toast Undo", () => {
  it("restores a demo budget and its category icon with one shared completion notice", async () => {
    const actions = mountActions(() => assert.fail("Demo Undo must not call the backend"));
    const expected = { ...budgetBefore, limit: 300000, icon: "wallet" };
    actions.state.live = false;
    actions.state.budgets = [expected];
    actions.state.notice = {
      message: "Budget updated.",
      undo: { kind: "budget", before: budgetBefore, expected, categoryIcon: "car" },
    };
    await actions.render().undo();
    assert.equal(actions.state.budgets[0], budgetBefore);
    assert.deepEqual(actions.state.restoredBudgets, [
      { before: budgetBefore, categoryIcon: "car" },
    ]);
    assert.deepEqual(actions.state.notices, [{ message: "Budget change undone." }]);
    assert.equal(actions.state.notice.undo, undefined);
    await actions.render().undo();
    assert.equal(actions.state.restoredBudgets.length, 1);
  });

  it("never overwrites a newer or removed demo budget, or creates a duplicate period", async () => {
    const expected = { ...budgetBefore, cadence: "monthly", limit: 300000 };
    for (const budgets of [
      [{ ...expected, limit: 350000 }],
      [],
      [expected, { ...budgetBefore, id: "another-weekly-budget" }],
    ]) {
      const actions = mountActions(() => assert.fail("Demo Undo must not call the backend"));
      actions.state.live = false;
      actions.state.budgets = budgets;
      actions.state.notice = {
        message: "Budget updated.",
        undo: { kind: "budget", before: budgetBefore, expected },
      };
      await actions.render().undo();
      assert.equal(actions.state.budgets, budgets);
      assert.equal(actions.state.restoredBudgets.length, 0);
      assert.equal(actions.state.notice.recovery, "budgets");
      assert.equal(actions.state.notice.undo, undefined);
    }
  });

  it("keeps a signed-in budget's receipt and routes expired Undo back to Budgets", async () => {
    const actions = mountActions(() => assert.fail("Expired Undo must not reach the backend"));
    actions.state.notice = {
      message: "Budget saved.",
      undo: {
        kind: "backend",
        receipt: { ...receipt, resourceType: "budget", undoExpiresAt: "2000-01-01T00:00:00Z" },
      },
    };
    await actions.render().undo();
    assert.equal(actions.requests.length, 0);
    assert.equal(actions.state.notice.recovery, "budgets");
    assert.equal(actions.state.notice.undo, undefined);
  });
});

describe("live exclusion actions", () => {
  const exclusionCategoryId = "00000000-0000-4000-8000-000000000202";
  const exclusionValues = {
    ...values,
    kind: "exclusion",
    category: "Internal",
    categoryId: exclusionCategoryId,
  };
  const exclusionResponse = () =>
    Response.json({
      transaction: { ...backendTransaction(), kind: "exclusion", categoryId: exclusionCategoryId },
      action: receipt,
    });
  const withReason = (actions) => {
    actions.state.resources.categories.push({
      id: exclusionCategoryId,
      name: "My own accounts",
      kind: "exclusion",
    });
    return actions;
  };

  it("creates a live exclusion with its owned reason UUID and offers Undo", async () => {
    const actions = withReason(mountActions(exclusionResponse));
    await actions.render().add(exclusionValues);
    assert.equal(actions.requests[0].path, "/api/finance/operations/add_transaction");
    assert.equal(actions.requests[0].input.kind, "exclusion");
    assert.equal(actions.requests[0].input.categoryId, exclusionCategoryId);
    assert.deepEqual(actions.state.notice.undo, { kind: "backend", receipt });
    assert.match(actions.state.notice.message, /totals unchanged/);
  });

  it("edits an exclusion or converts spending to an exclusion through the saved ledger", async () => {
    for (const existingKind of ["expense", "exclusion"]) {
      const actions = withReason(mountActions(exclusionResponse));
      actions.state.editing = {
        ...values,
        id: transactionId,
        kind: existingKind,
        status: "confirmed",
        backend: { ...backendTransaction(), kind: existingKind },
      };
      await actions.render().save(exclusionValues, "correct", reviewedVersion);
      assert.equal(actions.requests[0].path, "/api/finance/operations/edit_transaction");
      assert.equal(actions.requests[0].input.changes.kind, "exclusion");
      assert.equal(actions.requests[0].input.changes.categoryId, exclusionCategoryId);
      assert.equal(actions.requests[0].input.expectedUpdatedAt, reviewedVersion);
      assert.deepEqual(actions.state.notice.undo, { kind: "backend", receipt });
    }
  });

  it("confirms a pending exclusion with its source date without inventing an amount or account", async () => {
    const actions = mountActions(() =>
      Response.json({
        transaction: {
          ...backendTransaction(),
          kind: "exclusion",
          money: null,
          occurredOn: "2026-10-17",
          financialAccountId: null,
          categoryId: null,
        },
        action: receipt,
      }),
    );
    actions.state.transactions = [
      {
        ...values,
        id: transactionId,
        kind: "exclusion",
        amount: null,
        date: "2026-10-17",
        method: null,
        status: "pending",
        backend: {
          ...backendTransaction(),
          kind: "exclusion",
          money: null,
          occurredOn: "2026-10-17",
          financialAccountId: null,
          categoryId: null,
          reviewStatus: "pending",
        },
      },
    ];
    await actions.render().confirm(transactionId);
    assert.equal(actions.requests[0].path, "/api/finance/operations/confirm_pending");
    assert.equal(actions.requests[0].input.values.money, null);
    assert.equal(actions.requests[0].input.values.occurredOn, "2026-10-17");
    assert.equal(actions.requests[0].input.values.financialAccountId, null);
    assert.match(actions.state.notice.message, /totals unchanged/);
  });

  it("keeps undated imports pending and routes confirmation to Edit without a write", async () => {
    const actions = mountActions(exclusionResponse);
    const item = {
      ...values,
      id: transactionId,
      kind: "exclusion",
      status: "pending",
      date: null,
      backend: {
        ...backendTransaction(),
        kind: "exclusion",
        reviewStatus: "pending",
        occurredOn: null,
      },
    };
    actions.state.transactions = [item];
    await actions.render().confirm(transactionId);
    assert.equal(actions.requests.length, 0);
    assert.equal(actions.state.openedEdit, transactionId);
    actions.state.rejecting = item;
    await actions.render().rejectSelected();
    assert.equal(actions.requests.length, 0);
    assert.match(actions.state.rejectError, /actual transaction date/);
    assert.equal(actions.state.closed, 0);
  });

  it("prevents a manual exclusion without an account or amount before sending", async () => {
    const actions = withReason(mountActions(exclusionResponse));
    for (const missing of [{ method: null, financialAccountId: null }, { amount: null }]) {
      await assert.rejects(
        actions.render().add({ ...exclusionValues, ...missing }),
        /Check the transaction details/,
      );
    }
    assert.equal(actions.requests.length, 0);
  });

  it("prevents unknown, archived, and spending category IDs from becoming exclusion reasons", async () => {
    for (const category of [
      undefined,
      { id: exclusionCategoryId, kind: "exclusion", isArchived: true },
      { id: exclusionCategoryId, kind: "expense", name: "Internal" },
    ]) {
      const actions = mountActions(exclusionResponse);
      if (category) actions.state.resources.categories.push(category);
      await assert.rejects(
        actions.render().add(exclusionValues),
        (error) => error.code === "VALIDATION_FAILED",
      );
      assert.equal(actions.requests.length, 0);
    }
  });

  it("retains the live exclusion receipt and can reverse it", async () => {
    const actions = mountActions((path) =>
      path.endsWith("undo_action") ? Response.json({ ok: true }) : exclusionResponse(),
    );
    actions.state.rejecting = {
      ...values,
      id: transactionId,
      status: "pending",
      backend: backendTransaction(),
    };
    await actions.render().rejectSelected();
    assert.equal(actions.requests[0].path, "/api/finance/operations/exclude_pending");
    assert.deepEqual(actions.state.notice.undo, { kind: "backend", receipt });
    await actions.render().undo();
    assert.equal(actions.requests[1].path, "/api/finance/operations/undo_action");
    assert.match(actions.state.notice.message, /Change undone/);
  });
});

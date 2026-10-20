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
    transactions: [],
    editing: undefined,
    notice: null,
    drafts: { [editorKey]: structuredClone(draft) },
    view: { adding: true, transactionId: null },
    mutationCalls: 0,
    closed: 0,
  };
  const setter = (field) => (next) => {
    state[field] = typeof next === "function" ? next(state[field]) : next;
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
      live: true,
      resources: {
        financialAccounts: [{ id: accountId }],
        categories: [{ id: categoryId, kind: categoryKind, isArchived: categoryArchived }],
      },
      transactions: state.transactions,
      editing: state.editing,
      rejecting: undefined,
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

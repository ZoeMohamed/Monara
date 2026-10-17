import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

import { FinanceClientError } from "./client.ts";

// Keep the production hook intact while controlling promise order and committed
// effects. This harness supplies only the four hooks used by useFinanceSync.
const runtimeKey = Symbol.for("monara.finance-sync-test");
const reactSource = `
  const runtime = () => globalThis[Symbol.for("monara.finance-sync-test")];
  export const useState = (...args) => runtime().useState(...args);
  export const useRef = (...args) => runtime().useRef(...args);
  export const useCallback = (...args) => runtime().useCallback(...args);
  export const useEffect = (...args) => runtime().useEffect(...args);
`;
const presentationSource = `
  export const loadFinanceSnapshot = (...args) =>
    globalThis[Symbol.for("monara.finance-sync-test")].read(...args);
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/components/use-finance-sync.ts")) {
      if (specifier === "react") {
        return {
          url: `data:text/javascript,${encodeURIComponent(reactSource)}`,
          shortCircuit: true,
        };
      }
      if (specifier === "@/lib/finance/presentation") {
        return {
          url: `data:text/javascript,${encodeURIComponent(presentationSource)}`,
          shortCircuit: true,
        };
      }
      if (specifier === "@/lib/finance/client") {
        return { url: new URL("./client.ts", import.meta.url).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
const { useFinanceSync } = await import("../../components/use-finance-sync.ts");
hooks.deregister();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function ledger(month = "2026-10", version = "initial") {
  return { month, today: "2026-10-17", version };
}

function mountSync(initial = ledger()) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let month = initial.month;
  const reads = [];
  const same = (before, after) =>
    before?.length === after?.length &&
    before.every((value, index) => Object.is(value, after[index]));
  const runtime = {
    read(_reader, requestedMonth, today) {
      const next = deferred();
      reads.push({ ...next, month: requestedMonth, today });
      return next.promise;
    },
    useState(initialValue) {
      const index = cursor++;
      slots[index] ??= { value: initialValue };
      return [
        slots[index].value,
        (next) => {
          slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
        },
      ];
    },
    useRef(initialValue) {
      const index = cursor++;
      slots[index] ??= { current: initialValue };
      return slots[index];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) {
        slots[index] = { dependencies, callback };
      }
      return slots[index].callback;
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
  const useRenderSync = (nextMonth = month) => {
    month = nextMonth;
    cursor = 0;
    effects = [];
    globalThis[runtimeKey] = runtime;
    const result = useFinanceSync(initial, month, initial.today);
    for (const effect of effects) effect();
    return result;
  };
  return { render: useRenderSync, reads };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("finance sync recovery", () => {
  it("stops duplicate taps before React renders and never repeats the original write", async () => {
    const sync = mountSync();
    const current = sync.render();
    const save = deferred();
    let writes = 0;
    const first = current.runMutation(() => {
      writes += 1;
      return save.promise;
    });
    await assert.rejects(
      current.runMutation(async () => {
        writes += 1;
      }),
      { code: "CONFLICT" },
    );
    assert.equal(writes, 1);
    save.resolve("receipt");
    await flush();
    assert.equal(sync.reads.length, 1);
    sync.reads[0].resolve(ledger("2026-10", "saved"));
    assert.equal(await first, "receipt");
    assert.equal(sync.render().snapshot.version, "saved");
    assert.equal(sync.render().mutationPending, false);
  });

  it("requires reconciliation after an unexpected failure instead of unlocking another write", async () => {
    const sync = mountSync();
    const current = sync.render();
    let writes = 0;
    await assert.rejects(
      current.runMutation(async () => {
        writes += 1;
        throw new TypeError("Unexpected result after dispatch");
      }),
      (error) => error instanceof FinanceClientError && error.actionMayHaveCompleted,
    );
    assert.equal(sync.render().needsRecovery, true);
    assert.doesNotMatch(sync.render().error, /Unexpected result after dispatch/);
    await assert.rejects(
      sync.render().runMutation(async () => {
        writes += 1;
      }),
      { code: "CONFLICT" },
    );
    assert.equal(writes, 1);
    const refresh = sync.render().refresh();
    sync.reads[0].resolve(ledger("2026-10", "reconciled"));
    await refresh;
    assert.equal(sync.render().needsRecovery, false);
    assert.equal(sync.render().error, null);
  });

  it("ignores a read begun before an uncertain write and waits for a fresh recovery read", async () => {
    const sync = mountSync();
    const current = sync.render();
    const save = deferred();
    const change = current.runMutation(() => save.promise);
    sync.render("2026-11");
    assert.equal(sync.reads.length, 1);
    save.reject(
      new FinanceClientError(
        "DEPENDENCY_UNAVAILABLE",
        "The save could not be verified.",
        null,
        true,
      ),
    );
    await assert.rejects(change, (error) => error.actionMayHaveCompleted);
    sync.reads[0].resolve(ledger("2026-11", "started-before-save"));
    await flush();
    assert.equal(sync.render().snapshot.version, "initial");
    assert.equal(sync.render().needsRecovery, true);
    assert.equal(sync.render().pending, false);
    const recovery = sync.render().refresh();
    sync.reads[1].resolve(ledger("2026-11", "verified-after-save"));
    await recovery;
    assert.equal(sync.render().snapshot.version, "verified-after-save");
    assert.equal(sync.render().needsRecovery, false);
  });

  it("keeps a known saved change locked when its refresh fails and recovers without replaying it", async () => {
    const sync = mountSync();
    const current = sync.render();
    let writes = 0;
    const change = current.runMutation(async () => {
      writes += 1;
      return "saved";
    });
    await flush();
    sync.reads[0].reject(new FinanceClientError("DEPENDENCY_UNAVAILABLE", "Read failed.", null));
    await assert.rejects(
      change,
      (error) => error.actionMayHaveCompleted && /was saved/.test(error.message),
    );
    assert.equal(sync.render().snapshot.version, "initial");
    assert.equal(sync.render().needsRecovery, true);
    const recovery = sync.render().refresh();
    sync.reads[1].resolve(ledger("2026-10", "saved"));
    await recovery;
    assert.equal(sync.render().needsRecovery, false);
    assert.equal(writes, 1);
  });

  it("keeps verified chat receipts with a refresh warning while blocking further changes", async () => {
    const sync = mountSync();
    const current = sync.render();
    const change = current.runMutation(async () => ({ reply: "Done", action: "receipt" }), {
      refreshFailureMessage: "Saved. Refresh your records to see the latest version.",
      onRefreshFailure: (result, warning) => ({ ...result, warning }),
    });
    await flush();
    sync.reads[0].reject(new Error("Lost connection"));
    assert.deepEqual(await change, {
      reply: "Done",
      action: "receipt",
      warning: "Saved. Refresh your records to see the latest version.",
    });
    assert.equal(sync.render().needsRecovery, true);
    assert.equal(sync.render().mutationPending, false);
  });

  it("does not turn a known rejected validation into an uncertain save", async () => {
    const sync = mountSync();
    const current = sync.render();
    const invalid = new FinanceClientError("VALIDATION_FAILED", "Check the amount.", 422, false, {
      amount: ["Use a positive amount."],
    });
    await assert.rejects(
      current.runMutation(async () => {
        throw invalid;
      }),
      (error) => error === invalid,
    );
    assert.equal(sync.render().needsRecovery, false);
    assert.equal(sync.render().mutationPending, false);
    assert.equal(sync.reads.length, 0);
  });

  it("ignores late results after returning to the already verified month", async () => {
    const sync = mountSync();
    sync.render();
    sync.render("2026-11");
    assert.equal(sync.reads.length, 1);
    sync.render("2026-10");
    sync.reads[0].resolve(ledger("2026-11", "late"));
    await flush();
    assert.equal(sync.render().snapshot.month, "2026-10");
    assert.equal(sync.render().pending, false);
  });
});

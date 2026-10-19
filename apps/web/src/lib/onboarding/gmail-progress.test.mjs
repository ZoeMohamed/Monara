import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, it } from "node:test";
import ts from "typescript";

const hookUrl = new URL("../../components/use-gmail-onboarding.ts", import.meta.url).href;
const snapshotUrl = new URL("../gmail/import-snapshot.ts", import.meta.url).href;
const runtimeKey = Symbol.for("monara.gmail-progress-test");
const react = `
  const runtime = () => globalThis[Symbol.for("monara.gmail-progress-test")];
  export const useState = (...args) => runtime().useState(...args);
  export const useEffect = (...args) => runtime().useEffect(...args);
  export const useCallback = callback => callback;
  export const useRef = value => ({ current: value });
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === hookUrl && specifier === "react") {
      return { url: `data:text/javascript,${encodeURIComponent(react)}`, shortCircuit: true };
    }
    if (context.parentURL === snapshotUrl && specifier === "./import-feed.ts") {
      return {
        url: `data:text/javascript,export async function loadImportFeed() { return globalThis[Symbol.for("monara.gmail-progress-test")].feed ?? []; }`,
        shortCircuit: true,
      };
    }
    if (context.parentURL === hookUrl && specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== hookUrl) return nextLoad(url, context);
    return {
      format: "module",
      source: ts.transpileModule(
        `${readFileSync(new URL(url), "utf8")}\nexport { useImportProgress as progressForTest };`,
        {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        },
      ).outputText,
      shortCircuit: true,
    };
  },
});
const { progressForTest } = await import(hookUrl);
hooks.deregister();
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  delete globalThis[runtimeKey];
});

const connectionId = "6548c640-4dd8-4df7-8f41-a086f6c5f947";
const counts = {
  imported: 37,
  skipped: 2,
  failed: 1,
  inProgress: 27,
  importedTransactions: 36,
  confirmedTransactions: 0,
  categorizing: 26,
  needsReview: 10,
};

async function readProgress(state, overrides = {}, options = {}) {
  let progress;
  let runEffect;
  globalThis[runtimeKey] = {
    feed: options.feed,
    useState(initial) {
      progress = initial;
      return [
        progress,
        (update) => {
          progress = typeof update === "function" ? update(progress) : update;
        },
      ];
    },
    useEffect(effect) {
      runEffect = effect;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setInterval(_callback, delay) {
        options.delays?.push(delay);
        return 1;
      },
      clearInterval() {},
      setTimeout(_callback, delay) {
        options.delays?.push(delay);
        return 1;
      },
      clearTimeout() {},
    },
  });
  globalThis.fetch = async (path, init) => {
    assert.equal(path, "/api/gmail/connections");
    assert.equal(init.cache, "no-store");
    options.onRequest?.();
    return Response.json({
      connections: [
        {
          id: connectionId,
          gmailAddress: "synthetic@example.com",
          status: "active",
          lastSyncedAt: null,
          createdAt: "2026-10-19T00:00:00Z",
          sync: {
            state,
            error: null,
            requestedAt: "2026-10-19T00:00:00Z",
            counts: { ...counts, ...overrides },
          },
        },
      ],
    });
  };
  progressForTest(connectionId, true);
  const cleanup = runEffect();
  await new Promise((resolve) => setImmediate(resolve));
  cleanup();
  return progress;
}

it("carries actual API processed and claimed email counts into the live onboarding hook", async () => {
  const progress = await readProgress("running");
  assert.equal(progress.emailsRead, 40);
  assert.equal(progress.totalEmails, 67);
  assert.equal(progress.totalEmailsFinal, false);
  assert.equal(progress.transactions, 36);
  assert.equal(progress.categorizing, 26);
});

it("preserves final email counts when terminal reviews allow import completion", async () => {
  const progress = await readProgress("completed", {
    inProgress: 0,
    categorizing: 0,
    needsReview: 36,
  });
  assert.equal(progress.state, "completed");
  assert.equal(progress.emailsRead, 40);
  assert.equal(progress.totalEmails, 40);
  assert.equal(progress.totalEmailsFinal, true);
  assert.equal(progress.needsReview, 36);
});

it("updates the discovered denominator as new processing claims arrive", async () => {
  const before = await readProgress("running");
  const after = await readProgress("running", { inProgress: 30 });
  assert.equal(before.emailsRead, after.emailsRead);
  assert.equal(before.totalEmails, 67);
  assert.equal(after.totalEmails, 70);
  assert.equal(after.totalEmailsFinal, false);
});

it("checks again within one second while waiting for the first real transaction", async () => {
  const delays = [];
  await readProgress("running", { imported: 0, importedTransactions: 0 }, { delays });
  assert.equal(delays.at(-1), 1_000);
});

it("returns to normal polling once a persisted transaction is visible", async () => {
  const delays = [];
  await readProgress(
    "running",
    {},
    {
      delays,
      feed: [
        {
          id: "synthetic-first-row",
          kind: "expense",
          merchant: "Synthetic shop",
          amount: 25000,
          date: "2026-10-19",
          provider: "BCA",
          bankName: "Synthetic account",
        },
      ],
    },
  );
  assert.equal(delays.at(-1), 3_000);
});

it("bounds faster polling when a provider has not produced any rows", async () => {
  const realNow = Date.now;
  let now = 0;
  Date.now = () => now;
  const delays = [];
  try {
    await readProgress(
      "running",
      {},
      {
        delays,
        onRequest() {
          now = 15_001;
        },
      },
    );
    assert.equal(delays.at(-1), 3_000);
  } finally {
    Date.now = realNow;
  }
});

it("stops scheduling reads after the import completes, even with reviews remaining", async () => {
  const delays = [];
  await readProgress("completed", { inProgress: 0, categorizing: 0 }, { delays });
  assert.deepEqual(delays, []);
});

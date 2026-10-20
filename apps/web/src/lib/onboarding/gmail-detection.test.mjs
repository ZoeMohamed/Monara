import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { afterEach, it } from "node:test";
import ts from "typescript";

const hookUrl = new URL("../../components/use-gmail-onboarding.ts", import.meta.url).href;
const runtimeKey = Symbol.for("monara.gmail-detection-test");
const react = `
  const runtime = () => globalThis[Symbol.for("monara.gmail-detection-test")];
  export const useState = (...args) => runtime().useState(...args);
  export const useEffect = (...args) => runtime().useEffect(...args);
  export const useCallback = callback => callback;
  export const useRef = (...args) => runtime().useRef(...args);
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === hookUrl && specifier === "react") {
      return { url: `data:text/javascript,${encodeURIComponent(react)}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== hookUrl) return nextLoad(url, context);
    return {
      format: "module",
      source: ts.transpileModule(
        `${readFileSync(new URL(url), "utf8")}\nexport { useDetection as detectionForTest };`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
      ).outputText,
      shortCircuit: true,
    };
  },
});
const { detectionForTest } = await import(hookUrl);
hooks.deregister();

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let cleanup;
afterEach(() => {
  cleanup?.();
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  delete globalThis[runtimeKey];
});

const connectionId = "6548c640-4dd8-4df7-8f41-a086f6c5f947";
const discoveryPath = `/api/gmail/connections/${connectionId}/discovery`;
const completed = {
  state: "completed",
  suggestions: [
    {
      institutionKey: "BCA_MyBCA",
      provider: "BCA",
      name: "MyBCA",
      platform: "BANKING_APP",
      emailCount: 12,
      lastFours: ["1234"],
      linkedAccounts: [],
      isNew: false,
    },
  ],
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

function mount(respond) {
  const slots = [];
  const effects = [];
  const timers = new Map();
  const requests = [];
  let cursor = 0;
  let nextTimer = 0;
  globalThis[runtimeKey] = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [
        slots[slot],
        (update) => {
          slots[slot] = typeof update === "function" ? update(slots[slot]) : update;
        },
      ];
    },
    useRef(initial) {
      const slot = cursor++;
      slots[slot] ??= { current: initial };
      return slots[slot];
    },
    useEffect(run, deps) {
      const slot = cursor++;
      const previous = slots[slot];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        previous?.cleanup?.();
        const effect = { deps };
        slots[slot] = effect;
        effects.push(() => {
          effect.cleanup = run();
        });
      }
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(run, delay) {
        timers.set(++nextTimer, { run, delay });
        return nextTimer;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  });
  globalThis.fetch = async (path, init) => {
    requests.push({ path, method: init.method, signal: init.signal });
    assert.equal(init.cache, "no-store");
    return Response.json(await respond(path, init));
  };
  cleanup = () => {
    for (const slot of slots) slot?.cleanup?.();
  };
  return {
    requests,
    timers,
    render(phase, ...mailbox) {
      cursor = 0;
      const result = detectionForTest(mailbox.length ? mailbox[0] : connectionId, phase);
      for (const effect of effects.splice(0)) effect();
      return result;
    },
    async tick() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.run();
      await settle();
    },
  };
}

it("has banks ready on entering detect when name-step prefetch completed, with no extra request", async () => {
  const app = mount(() => completed);
  app.render("name");
  await settle();
  const { detection } = app.render("detect");
  assert.equal(detection.status, "ready");
  assert.equal(detection.choices[0].institutionKey, "BCA_MyBCA");
  assert.deepEqual(
    app.requests.map(({ path, method }) => ({ path, method })),
    [{ path: `${discoveryPath}?refresh=false`, method: "GET" }],
  );
  assert.equal(app.timers.size, 0);
});

it("leaves name-step failures in the background and recovers when the user reaches detect", async () => {
  const app = mount((path) =>
    path.endsWith("refresh=false") ? { state: "failed", suggestions: [] } : completed,
  );
  app.render("name");
  await settle();
  assert.equal(app.render("name").detection.status, "scanning");
  app.render("detect");
  await settle();
  assert.equal(app.render("detect").detection.status, "ready");
  assert.deepEqual(
    app.requests.map(({ path }) => path),
    [`${discoveryPath}?refresh=false`, discoveryPath],
  );
});

it("polls idle or running scans without POSTing another scan", async () => {
  for (const state of ["idle", "running"]) {
    const app = mount(() => ({ state, suggestions: [] }));
    app.render("name");
    await settle();
    app.render("detect");
    await settle();
    await app.tick();
    assert.equal(app.requests.length, 3);
    assert.ok(app.requests.every(({ method }) => method === "GET"));
    cleanup();
  }
});

it("uses the explicit retry response immediately, without a delayed follow-up GET", async () => {
  const app = mount((_path, init) =>
    init.method === "POST" ? completed : { state: "failed", suggestions: [] },
  );
  app.render("detect");
  await settle();
  const failed = app.render("detect");
  assert.equal(failed.detection.status, "failed");
  failed.retry();
  app.render("detect");
  await settle();
  assert.equal(app.render("detect").detection.status, "ready");
  assert.deepEqual(
    app.requests.map(({ method }) => method),
    ["GET", "POST"],
  );
  assert.equal(app.timers.size, 0);
});

it("cancels prefetch on leaving setup and ignores its late result", async () => {
  let resolve;
  const app = mount(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app.render("name");
  app.render("done");
  assert.ok(app.requests[0].signal.aborted);
  resolve(completed);
  await settle();
  assert.equal(app.render("done").detection.status, "scanning");
  assert.equal(app.timers.size, 0);
});

it("does not reuse one mailbox's banks after the connection changes", async () => {
  const app = mount(() => completed);
  app.render("name");
  await settle();
  assert.equal(app.render("name").detection.status, "ready");
  const other = "00000000-0000-4000-8000-000000000099";
  assert.equal(app.render("name", other).detection.status, "scanning");
  assert.equal(app.requests.length, 2);
  await settle();
  assert.equal(app.render("detect", other).detection.status, "ready");
});

it("starts the visible timeout at detect, even after a long name entry", async () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    const app = mount(() => ({ state: "running", suggestions: [] }));
    app.render("name");
    await settle();
    now = 180_000;
    await app.tick();
    assert.equal(app.render("name").detection.status, "scanning");
    app.render("detect");
    await settle();
    assert.equal(app.render("detect").detection.status, "scanning");
    assert.equal(app.timers.size, 1);
    now += 90_001;
    await app.tick();
    assert.equal(app.render("detect").detection.status, "failed");
    assert.equal(app.timers.size, 0);
  } finally {
    Date.now = originalNow;
  }
});

it("does not check discovery until a connected mailbox is known", () => {
  const app = mount(() => completed);
  for (const mailbox of [undefined, null]) {
    assert.equal(app.render("name", mailbox).detection.status, "scanning");
  }
  assert.equal(app.requests.length, 0);
});

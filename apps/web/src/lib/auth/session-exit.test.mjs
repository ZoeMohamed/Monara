import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { it } from "node:test";
import ts from "typescript";
import {
  isConfirmedSessionExiting,
  leaveDeletedAccount,
  protectUnsavedChanges,
  USER_SESSION_EXIT_EVENT,
} from "./local-user-state.ts";

const guardUrl = new URL("../../components/user-session-guard.tsx", import.meta.url).href;
const runtimeKey = Symbol.for("monara.session-exit-test");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== guardUrl) return nextResolve(specifier, context);
    if (specifier === "react")
      return {
        url: `data:text/javascript,${encodeURIComponent(`
          const runtime = () => globalThis[Symbol.for("monara.session-exit-test")];
          export const useState = (...args) => runtime().useState(...args);
          export const useEffect = (...args) => runtime().useEffect(...args);`)}`,
        shortCircuit: true,
      };
    if (specifier === "react/jsx-runtime")
      return {
        url: "data:text/javascript,export const jsx = (type, props) => ({ type, props }), jsxs = jsx;",
        shortCircuit: true,
      };
    if (specifier === "@/lib/auth/local-user-state")
      return nextResolve(new URL("./local-user-state.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== guardUrl) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: "user-session-guard.tsx",
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
  },
});
const { UserSessionGuard } = await import(guardUrl);
hooks.deregister();

it("protects ordinary drafts but discards a confirmed invalid owner's private view without an unload veto", async (t) => {
  let cleanup;
  const globals = [
    "window",
    "document",
    "fetch",
    "BroadcastChannel",
    "setInterval",
    "clearInterval",
  ];
  const originals = new Map(
    globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  t.after(() => {
    cleanup?.();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    delete globalThis[runtimeKey];
  });
  const values = new Map([["monara.active-user", "synthetic-owner"]]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible", cookie: "" });
  const navigation = [];
  const attemptNavigation = (destination) => {
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    navigation.push({ destination, blocked: unload.defaultPrevented });
  };
  Object.assign(window, {
    localStorage: storage,
    sessionStorage: storage,
    location: { replace: attemptNavigation, reload: () => attemptNavigation("reload") },
  });
  const channels = [];
  let status = "active";
  let reads = 0;
  const replacements = {
    window,
    document,
    fetch: async () => {
      reads += 1;
      if (status === "offline") throw new Error("Synthetic offline request");
      return status === "unavailable"
        ? Response.json({ message: "Try later" }, { status: 503 })
        : Response.json({ setupKey: status === "active" ? "synthetic-owner" : null });
    },
    BroadcastChannel: class {
      constructor() {
        channels.push(this);
      }
      postMessage() {}
      close() {}
    },
    setInterval: () => 1,
    clearInterval: () => {},
  };
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  let state;
  let mounted = false;
  globalThis[runtimeKey] = {
    useState(initial) {
      if (!mounted) state = typeof initial === "function" ? initial() : initial;
      return [
        state,
        (next) => {
          state = typeof next === "function" ? next(state) : next;
        },
      ];
    },
    useEffect(effect) {
      if (!mounted) {
        mounted = true;
        cleanup = effect();
      }
    },
  };
  const privateView = "synthetic private account records and drafts";
  const render = () => UserSessionGuard({ setupKey: "synthetic-owner", children: privateView });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  assert.equal(render(), privateView);
  await settle();
  // Chat, budget and transaction forms all use this policy with distinct listeners.
  for (let index = 0; index < 3; index += 1)
    window.addEventListener("beforeunload", (event) => protectUnsavedChanges(event));
  const ordinaryUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(ordinaryUnload);
  assert.equal(ordinaryUnload.defaultPrevented, true);
  window.dispatchEvent(new Event(USER_SESSION_EXIT_EVENT));
  assert.equal(render(), privateView, "an arbitrary browser event cannot discard the private view");

  const beforeWrongOwner = reads;
  channels[0].onmessage({ data: { setupKey: "other-owner" } });
  await settle();
  assert.equal(reads, beforeWrongOwner);
  for (status of ["active", "unavailable", "offline"]) {
    channels[0].onmessage({ data: { setupKey: "synthetic-owner" } });
    await settle();
    assert.equal(render(), privateView);
    assert.equal(isConfirmedSessionExiting(), false);
    assert.equal(navigation.length, 0, "a browser hint or failed check cannot discard drafts");
  }
  status = "inactive";
  channels[0].onmessage({ data: { setupKey: "synthetic-owner" } });
  await settle();
  assert.equal(isConfirmedSessionExiting(), true);
  assert.deepEqual(navigation, [{ destination: "/account-deletion", blocked: false }]);
  assert.equal(render().type, "main");
  assert.doesNotMatch(JSON.stringify(render()), /synthetic private account/);
  leaveDeletedAccount("synthetic-owner");
  assert.equal(
    navigation.at(-1).blocked,
    false,
    "accepted local deletion also bypasses stale draft vetoes",
  );
});

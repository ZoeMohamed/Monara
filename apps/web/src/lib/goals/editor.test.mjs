import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, it } from "node:test";
import ts from "typescript";
import { newGoalSession } from "./draft.ts";

const goalUrl = new URL("../../components/goal-planner.tsx", import.meta.url).href;
const runtimeKey = Symbol.for("monara.goal-editor-test");
const uiSource = `
  export const Button = "button", Card = "card", ProgressBar = "progress", FinanceRecovery = "recovery",
    Icon = "icon", ModalDialog = "dialog";
  export const useAmountDisplay = () => ({ formatRupiah: (amount) => String(amount) });
  export const useGoalDraftSessions = () => globalThis[Symbol.for("monara.goal-editor-test")].drafts;
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/"))
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (context.parentURL !== goalUrl) return nextResolve(specifier, context);
    if (specifier === "react")
      return {
        url: `data:text/javascript,${encodeURIComponent(`
          const runtime = () => globalThis[Symbol.for("monara.goal-editor-test")];
          export const useState = (...args) => runtime().useState(...args);
          export const useRef = (...args) => runtime().useRef(...args);
          export const useId = () => "goal-test";
          export const useMemo = (calculate) => calculate();`)}`,
        shortCircuit: true,
      };
    if (specifier === "react/jsx-runtime")
      return {
        url: "data:text/javascript,export const jsx = (type, props) => ({ type, props }), jsxs = jsx, Fragment = 'fragment';",
        shortCircuit: true,
      };
    if (specifier === "@monara/ui" || specifier.startsWith("@/components/"))
      return { url: `data:text/javascript,${encodeURIComponent(uiSource)}`, shortCircuit: true };
    if (specifier === "next/image")
      return { url: "data:text/javascript,export default 'image';", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== goalUrl) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(
        `${readFileSync(new URL(url), "utf8")}\nexport { GoalEditor as GoalEditorForTest };`,
        {
          fileName: "goal-planner.tsx",
          compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        },
      ).outputText,
    };
  },
});
const { GoalEditorForTest, GoalPlanner } = await import(goalUrl);
hooks.deregister();
after(() => delete globalThis[runtimeKey]);

function runtime() {
  const state = [];
  let cursor = 0;
  const value = {
    drafts: {
      sessions: {},
      demoGoals: null,
      localImages: {},
      setNotice() {},
      setDemoGoals() {},
      setLocalImages() {},
      get: (key) => value.drafts.sessions[key],
      keep: (key, session) => {
        value.drafts.sessions[key] = session;
      },
      forget: (key) => {
        delete value.drafts.sessions[key];
      },
      claim: () => true,
      release() {},
    },
    useState(initial) {
      const index = cursor++;
      state[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        state[index].value,
        (next) => {
          state[index].value = typeof next === "function" ? next(state[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      state[index] ??= { current: initial };
      return state[index];
    },
    render(component, props) {
      cursor = 0;
      globalThis[runtimeKey] = value;
      return component(props);
    },
  };
  return value;
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean) ?? null;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const goal = {
  id: "a1000000-0000-4000-8000-000000000001",
  name: "Laptop",
  target: { amountMinor: "12000000", currency: "IDR" },
  saved: { amountMinor: "6000000", currency: "IDR" },
  targetDate: "2027-04-19",
  status: "active",
  imagePath: null,
  deletedAt: null,
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
};

it("focuses the first invalid goal field and keeps invalid entries without dispatching a save", async () => {
  const view = runtime();
  const session = newGoalSession(null, "2026-10-19");
  let saves = 0;
  const props = {
    session,
    today: "2026-10-19",
    onClose() {},
    onDiscard() {},
    onChange() {},
    onReviewLatest() {},
    onSave: async () => {
      saves += 1;
    },
  };
  const focused = [];
  const form = find(view.render(GoalEditorForTest, props), (node) => node.type === "form");
  await form.props.onSubmit({
    preventDefault() {},
    currentTarget: { querySelector: (selector) => ({ focus: () => focused.push(selector) }) },
  });
  assert.equal(saves, 0);
  assert.deepEqual(focused, ['[name="name"]']);
  const fields = find(
    view.render(GoalEditorForTest, props),
    (node) => node.type?.name === "GoalDraftFields",
  );
  assert.match(fields.props.errors.name, /goal name/);
  assert.equal(fields.props.draft, session.draft);
});

it("requires successful refresh and explicit latest-version review before deleting a goal", async () => {
  const view = runtime();
  let writes = 0;
  const props = {
    goals: [goal],
    transactions: [],
    today: "2026-10-19",
    demo: false,
    refreshRequired: true,
    runMutation: async () => {
      writes += 1;
      return { ...goal, deletedAt: "2026-10-19T00:02:00Z" };
    },
  };
  const render = () => view.render(GoalPlanner, props);
  find(render(), (node) => node.type?.name === "GoalPlanCard").props.onDelete();
  const dialog = () => find(render(), (node) => node.type?.name === "GoalDeleteDialog");
  await dialog().props.onDelete();
  assert.equal(writes, 0, "refresh-required state never dispatches deletion");
  props.refreshRequired = false;
  const latest = { ...goal, name: "Updated laptop plan", updatedAt: "2026-10-19T00:01:00Z" };
  props.goals = [latest];
  assert.equal(dialog().props.needsReview, true);
  await dialog().props.onDelete();
  assert.equal(writes, 0, "a new saved version requires the User's review");
  dialog().props.onReviewLatest(latest);
  assert.equal(dialog().props.needsReview, false);
  await dialog().props.onDelete();
  assert.equal(writes, 1);
  assert.equal(dialog(), null);
});

it("keeps completed goals editable so a corrected saved amount returns the goal to the active plan", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const view = runtime();
  const completed = { ...goal, saved: goal.target, status: "completed" };
  const corrected = { ...goal, updatedAt: "2026-10-19T00:01:00Z" };
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json(corrected);
  };
  const props = {
    goals: [completed],
    transactions: [],
    today: "2026-10-19",
    demo: false,
    runMutation: async (operation) => {
      const result = await operation();
      props.goals = [result];
      return result;
    },
  };
  const render = () => view.render(GoalPlanner, props);
  const completedSection = find(render(), (node) => node.type === "details");
  assert.ok(completedSection, "completed goals have an expandable recovery path");
  const completedCard = find(completedSection, (node) => node.type?.name === "GoalPlanCard");
  assert.equal(completedCard.props.item.goal.status, "completed");
  completedCard.props.onEdit();
  const editor = () => find(render(), (node) => node.type?.name === "GoalEditor");
  assert.equal(editor().props.session.draft.saved, completed.target.amountMinor);
  editor().props.onChange({ ...editor().props.session.draft, saved: goal.saved.amountMinor });
  await editor().props.onSave();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/finance/operations/edit_financial_goal");
  assert.equal(requests[0].body.expectedUpdatedAt, completed.updatedAt);
  assert.equal(requests[0].body.changes.saved.amountMinor, goal.saved.amountMinor);
  assert.equal(editor(), null);
  assert.equal(
    find(render(), (node) => node.type === "details"),
    null,
  );
  assert.equal(
    find(render(), (node) => node.type?.name === "GoalPlanCard").props.item.goal.status,
    "active",
  );
});

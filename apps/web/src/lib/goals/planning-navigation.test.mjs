import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, it } from "node:test";
import ts from "typescript";

const componentUrl = new URL("../../components/budget-planning-screen.tsx", import.meta.url).href;
const runtimeKey = Symbol.for("monara.planning-navigation-test");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== componentUrl) return nextResolve(specifier, context);
    const sources = {
      react: `const runtime = () => globalThis[Symbol.for("monara.planning-navigation-test")]; export const useState = (...args) => runtime().useState(...args); export const useId = () => "planning-test";`,
      "react/jsx-runtime": "export const jsx = (type, props) => ({ type, props }), jsxs = jsx;",
      "@/components/icon": "export const Icon = 'icon';",
    };
    if (specifier in sources)
      return {
        url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== componentUrl) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: "budget-planning-screen.tsx",
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
  },
});
const { BudgetPlanningScreen } = await import(componentUrl);
hooks.deregister();
after(() => delete globalThis[runtimeKey]);

function mount() {
  let view = "budgets";
  globalThis[runtimeKey] = {
    useState: () => [
      view,
      (next) => {
        view = next;
      },
    ],
  };
  return () => {
    const tree = BudgetPlanningScreen({ budgets: "owned budget view", goals: "owned goal view" });
    const [list, budgetPanel, goalPanel] = tree.props.children;
    return { tabs: list.props.children, panels: { budgets: budgetPanel, goals: goalPanel } };
  };
}

it("gives Planning tabs stable accessible relationships and mounts only the selected private view", () => {
  const render = mount();
  const first = render();
  assert.equal(first.tabs.length, 2);
  for (const [index, name] of ["budgets", "goals"].entries()) {
    const tab = first.tabs[index].props;
    const panel = first.panels[name].props;
    assert.equal(tab.role, "tab");
    assert.equal(panel.role, "tabpanel");
    assert.equal(tab["aria-controls"], panel.id);
    assert.equal(panel["aria-labelledby"], tab.id);
    assert.equal(tab.tabIndex, index === 0 ? 0 : -1);
    assert.equal(tab["aria-selected"], index === 0);
  }
  assert.equal(first.panels.budgets.props.children, "owned budget view");
  assert.equal(first.panels.goals.props.children, null);
  first.tabs[1].props.onClick();
  const next = render();
  assert.equal(next.tabs[1].props["aria-selected"], true);
  assert.equal(next.panels.goals.props.hidden, false);
  assert.equal(next.panels.goals.props.children, "owned goal view");
  assert.equal(next.panels.budgets.props.hidden, true);
  assert.equal(next.panels.budgets.props.children, null);
});

it("moves selected tab and focus together for arrows, Home and End without intercepting ordinary Tab", () => {
  const render = mount();
  const focused = [];
  const press = (key, activeIndex) => {
    let prevented = false;
    render().tabs[activeIndex].props.onKeyDown({
      key,
      preventDefault: () => {
        prevented = true;
      },
      currentTarget: {
        parentElement: { querySelector: (selector) => ({ focus: () => focused.push(selector) }) },
      },
    });
    return prevented;
  };
  for (const [key, from, to] of [
    ["ArrowRight", 0, 1],
    ["ArrowLeft", 1, 0],
    ["End", 0, 1],
    ["Home", 1, 0],
    ["ArrowLeft", 0, 1],
  ]) {
    assert.equal(press(key, from), true);
    const result = render();
    assert.equal(result.tabs[to].props["aria-selected"], true);
    assert.equal(result.tabs[to].props.tabIndex, 0);
    assert.equal(result.tabs[1 - to].props.tabIndex, -1);
    assert.equal(focused.at(-1), `[data-planning-view="${to === 0 ? "budgets" : "goals"}"]`);
  }
  const count = focused.length;
  assert.equal(press("Tab", 1), false);
  assert.equal(focused.length, count);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { it } from "node:test";
import ts from "typescript";

const bannerUrl = new URL("../../components/onboarding-banner.tsx", import.meta.url).href;
const componentUrl = new URL("../../components/onboarding-import.tsx", import.meta.url).href;
const jsx = "export const jsx = (type, props) => ({type,props}), jsxs = jsx, Fragment = null;";
const dependencies = `export const Button = null, ProgressBar = { Track: "track", Fill: "fill" }, OnboardingAvatar = null, OnboardingMark = null,
  BankBadge = null, ButtonIcon = null, StepFrame = null, onboardingTitleId = "onboarding-title",
  useAmountDisplay = null, formatDay = null, CategoryAvatar = null, Icon = null,
  ImportSteps = "ImportSteps", importPercent = () => null;
  let appSession = {};
  export const useAppSession = () => appSession;
  export const setAppSession = (value) => { appSession = value; };`;
const dependenciesUrl = `data:text/javascript,${encodeURIComponent(dependencies)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (![componentUrl, bannerUrl].includes(context.parentURL))
      return nextResolve(specifier, context);
    if (specifier === "react/jsx-runtime") {
      return { url: `data:text/javascript,${encodeURIComponent(jsx)}`, shortCircuit: true };
    }
    if (specifier.endsWith(".module.css")) {
      return {
        url: `data:text/javascript,export default new Proxy({}, { get: (_, key) => String(key) });`,
        shortCircuit: true,
      };
    }
    if (specifier === "@monara/ui" || specifier.startsWith("@/")) {
      return {
        url: dependenciesUrl,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (![componentUrl, bannerUrl].includes(url)) return nextLoad(url, context);
    const source =
      readFileSync(new URL(url), "utf8") +
      (url === componentUrl ? "\nexport { ImportSummary as summaryForTest };" : "");
    return {
      format: "module",
      source: ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      shortCircuit: true,
    };
  },
});
const { ImportStep, summaryForTest } = await import(componentUrl);
const { OnboardingBanner } = await import(bannerUrl);
const { setAppSession } = await import(dependenciesUrl);
hooks.deregister();

function text(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}

function paragraphs(node, className) {
  if (node === null || node === undefined || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => paragraphs(child, className));
  const matches = node.type === "p" && node.props?.className === className ? [node] : [];
  return matches.concat(paragraphs(node.props?.children, className));
}

function countRows(progress) {
  return paragraphs(summaryForTest({ progress }), "counts").map(text);
}

function hasSteps(node) {
  if (node === null || node === undefined || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(hasSteps);
  return node.type === "ImportSteps" || hasSteps(node.props?.children);
}

const running = {
  state: "running",
  emailsRead: 67,
  totalEmails: 67,
  transactions: 64,
  categorizing: 54,
  needsReview: 10,
  feed: [],
  totalTransactions: null,
};

it("shows the steps instead of text and counts while the import works", () => {
  for (const progress of [running, { ...running, state: "waiting" }]) {
    assert.deepEqual(paragraphs(summaryForTest({ progress }), "sub"), []);
    assert.deepEqual(countRows(progress), []);
    const step = ImportStep({ progress, onNext() {} });
    assert.ok(hasSteps(step.props.children), "the import steps should be on screen");
  }
});

it("lets terminal review results complete with a full bar and an exit action", () => {
  const completed = { ...running, state: "completed", categorizing: 0, needsReview: 51 };
  const summary = text(summaryForTest({ progress: completed }));
  assert.match(summary, /All caught up/);
  assert.deepEqual(countRows(completed), ["64 transactions imported"]);
  const step = ImportStep({ progress: completed, onNext() {} });
  assert.equal(hasSteps(step.props.children), false);
  assert.match(text(step.props.actions), /Explore Monara/);
});

it("explains a failed import with its message", () => {
  const failed = { ...running, state: "failed", message: "Gmail could not be read." };
  assert.match(text(summaryForTest({ progress: failed })), /Gmail could not be read\./);
  assert.equal(hasSteps(ImportStep({ progress: failed, onNext() {} }).props.children), false);
});

it("keeps the background banner honest during classification", () => {
  setAppSession({ gmailImport: { progress: running, onOpen() {}, onFinish() {} } });
  const banner = OnboardingBanner();
  assert.match(text(banner), /10 \/ 64 transactions processed/);
});

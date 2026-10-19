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
  useAmountDisplay = null, formatDay = null, CategoryAvatar = null, Icon = null;
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
      (url === componentUrl
        ? "\nexport { ImportSummary as summaryForTest, percent as percentForTest };"
        : "");
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
const { ImportStep, summaryForTest, percentForTest } = await import(componentUrl);
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

function countRow(progress) {
  const rows = paragraphs(summaryForTest({ progress }), "counts");
  assert.equal(rows.length, 1, "summary should render exactly one count row");
  return text(rows[0]);
}

const running = {
  state: "running",
  emailsRead: 67,
  totalEmails: null,
  transactions: 64,
  categorizing: 54,
  needsReview: 10,
  feed: [],
  totalTransactions: null,
};

it("shows one concise transaction count row while categorizing", () => {
  assert.equal(countRow(running), "10 / 64 transactions processed");
  const advanced = { ...running, categorizing: 13, needsReview: 51 };
  assert.equal(countRow(advanced), "51 / 64 transactions processed");
});

it("uses only currently imported transactions when extraction overlaps categorization", () => {
  const growing = {
    ...running,
    emailsRead: 70,
    transactions: 68,
    categorizing: 14,
    needsReview: 54,
  };
  assert.equal(countRow(growing), "54 / 68 transactions processed");
  assert.equal(percentForTest(growing), null);
  assert.equal(percentForTest({ ...growing, totalEmails: 70 }), null);
});

it("shows a provisional email count when discovery is incomplete", () => {
  const progress = { ...running, categorizing: 0, totalEmails: 67, totalEmailsFinal: false };
  assert.equal(countRow(progress), "67 / 67 emails processed (found so far)");
});

it("shows only the email counter after discovery reaches its final total", () => {
  const progress = { ...running, categorizing: 0, totalEmails: 65, totalEmailsFinal: true };
  assert.equal(countRow(progress), "67 / 65 emails processed");
});

it("lets terminal review results complete with a full bar and an exit action", () => {
  const completed = { ...running, state: "completed", categorizing: 0, needsReview: 51 };
  const summary = text(summaryForTest({ progress: completed }));
  assert.match(summary, /All caught up/);
  assert.doesNotMatch(summary, /Categorizing your transactions/);
  assert.equal(countRow(completed), "64 transactions imported");
  assert.equal(percentForTest(completed), 100);
  const step = ImportStep({ progress: completed, onNext() {} });
  assert.match(text(step.props.actions), /Explore Monara/);
});

it("keeps the background banner honest during classification", () => {
  setAppSession({ gmailImport: { progress: running, onOpen() {}, onFinish() {} } });
  const banner = OnboardingBanner();
  assert.match(text(banner), /10 \/ 64 transactions processed/);
});

it("labels the live email denominator as provisional and never treats discovered work as a final total", () => {
  const progress = { ...running, totalEmails: 67, totalEmailsFinal: false, categorizing: 0 };
  const summary = text(summaryForTest({ progress }));
  assert.match(summary, /67 \/ 67 emails processed \(found so far\)/);
  assert.equal(percentForTest(progress), null);
  assert.equal(percentForTest({ ...progress, totalEmails: 70 }), null);
  assert.equal(percentForTest({ ...progress, totalEmails: 70, totalEmailsFinal: true }), 96);
});

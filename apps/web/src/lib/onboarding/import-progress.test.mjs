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
  useAmountDisplay = null, formatDay = null;`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (![componentUrl, bannerUrl].includes(context.parentURL))
      return nextResolve(specifier, context);
    if (specifier === "react/jsx-runtime") {
      return { url: `data:text/javascript,${encodeURIComponent(jsx)}`, shortCircuit: true };
    }
    if (specifier.endsWith(".module.css")) {
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    }
    if (specifier === "@monara/ui" || specifier.startsWith("@/")) {
      return {
        url: `data:text/javascript,${encodeURIComponent(dependencies)}`,
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
hooks.deregister();

function text(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}

it("shows processed emails over the known email total, rather than ambiguous emails and found", () => {
  const summary = text(
    summaryForTest({
      progress: {
        state: "running",
        emailsRead: 37,
        totalEmails: 67,
        transactions: 36,
        categorizing: 26,
        needsReview: 10,
        feed: [],
        totalTransactions: null,
      },
    }),
  );
  assert.match(summary, /37 \/ 67 emails processed/);
  assert.match(summary, /36 transactions found/);
  assert.match(summary, /10 need review in Pending/);
});

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

it("shows classification work advancing while email processing is unchanged", () => {
  const before = text(summaryForTest({ progress: running }));
  const after = text(
    summaryForTest({ progress: { ...running, categorizing: 13, needsReview: 51 } }),
  );
  assert.match(before, /67 emails processed · 64 transactions found/);
  assert.match(before, /10 \/ 64 transactions processed/);
  assert.match(after, /51 \/ 64 transactions processed/);
  assert.match(after, /51 need review in Pending/);
  assert.doesNotMatch(before, /67 \/ 64 emails/);
});

it("uses only currently imported transactions when extraction overlaps categorization", () => {
  const growing = {
    ...running,
    emailsRead: 70,
    transactions: 68,
    categorizing: 14,
    needsReview: 54,
  };
  const summary = text(summaryForTest({ progress: growing }));
  assert.match(summary, /70 emails processed · 68 transactions found/);
  assert.match(summary, /54 \/ 68 transactions processed/);
  assert.equal(percentForTest(growing), null);
  assert.equal(percentForTest({ ...growing, totalEmails: 70 }), null);
});

it("lets terminal review results complete with a full bar and an exit action", () => {
  const completed = { ...running, state: "completed", categorizing: 0, needsReview: 51 };
  const summary = text(summaryForTest({ progress: completed }));
  assert.match(summary, /All caught up/);
  assert.match(summary, /51 need review in Pending/);
  assert.doesNotMatch(summary, /Categorizing your transactions/);
  assert.equal(percentForTest(completed), 100);
  const step = ImportStep({ progress: completed, onNext() {} });
  assert.match(text(step.props.actions), /Explore Monara/);
});

it("keeps the background banner honest during classification", () => {
  const banner = OnboardingBanner({ progress: running, onOpen() {}, onFinish() {}, inset: false });
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

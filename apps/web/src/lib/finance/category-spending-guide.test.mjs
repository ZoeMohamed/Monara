import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const guideUrl = new URL("../../components/category-spending-guide.tsx", import.meta.url).href;
const uiSource = `export const Card = ({ children }) => children, Icon = () => null,
  SectionTitle = () => null, useAmountDisplay = () => ({ formatRupiah: (value) => String(value) });`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== guideUrl) return nextResolve(specifier, context);
    if (specifier === "@monara/ui" || specifier.startsWith("@/components/"))
      return { url: `data:text/javascript,${encodeURIComponent(uiSource)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== guideUrl) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: "category-spending-guide.tsx",
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
  },
});
const { CategorySpendingGuide } = await import(guideUrl);
hooks.deregister();

const money = (amount) => ({ amountMinor: String(amount), currency: "IDR" });
const guide = (budgetId, startsOn, endsOn, daily) => ({
  budgetId,
  categoryName: "Resto & Cafe",
  periodStartsOn: startsOn,
  periodEndsOn: endsOn,
  dailyAmount: money(daily),
  limit: money(310000),
  spending: money(100000),
  remaining: money(210000),
  shortfall: money(0),
  remainingDays: 13,
});
const insights = {
  asOf: "2026-10-19",
  safeToSpend: {
    byCategory: [
      guide("monthly-food", "2026-10-01", "2026-10-31", 9000),
      guide("weekly-food", "2026-10-19", "2026-10-25", 7000),
    ],
  },
};
const render = (budgetIds) =>
  renderToStaticMarkup(
    createElement(CategorySpendingGuide, {
      insights,
      month: "2026-10",
      today: "2026-10-19",
      budgetIds,
    }),
  );

describe("category spending guide period scope", () => {
  it("shows only the selected budget's figures when the same category has weekly and monthly limits", () => {
    const monthly = render(["monthly-food"]);
    assert.equal(monthly.match(/Resto &amp; Cafe/g)?.length, 1);
    assert.match(monthly, /9000/);
    assert.match(monthly, /Oct 31/);
    assert.doesNotMatch(monthly, /7000|Oct 25/);
    const weekly = render(["weekly-food"]);
    assert.match(weekly, /7000/);
    assert.match(weekly, /Oct 25/);
    assert.doesNotMatch(weekly, /9000|Oct 31/);
  });

  it("retains all guides for unscoped callers and hides the section when none match", () => {
    assert.equal(render(undefined).match(/Resto &amp; Cafe/g)?.length, 2);
    assert.equal(render([]), "");
    assert.equal(render(["unavailable-budget"]), "");
  });
});

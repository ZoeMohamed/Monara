"use client";

import type { CategorySafeToSpend, FinancialInsights } from "@monara/contracts";
import { Card } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import { SectionTitle } from "@/components/visual";

function guideDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CategoryGuide({ guide, asOf }: { guide: CategorySafeToSpend; asOf: string }) {
  const { formatRupiah } = useAmountDisplay();
  const basis = [
    { label: "Budget limit", amount: guide.limit },
    { label: "Confirmed spending", amount: guide.spending },
    { label: "Remaining", amount: guide.remaining },
    { label: "Over limit", amount: guide.shortfall },
  ];

  return (
    <li className="min-w-0">
      <details className="group min-w-0">
        <summary className="min-h-14 cursor-pointer list-none rounded-xl py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
              {guide.categoryName}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
                <span data-amount>{formatRupiah(BigInt(guide.dailyAmount.amountMinor))}</span>
                <span className="font-normal text-muted"> / day</span>
              </span>
              <Icon
                className="h-4 w-4 shrink-0 text-muted group-open:rotate-180"
                name="chevron-down"
              />
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            {guideDate(guide.periodStartsOn)} – {guideDate(guide.periodEndsOn)}
          </span>
        </summary>
        <div className="pb-4">
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {basis.map(({ label, amount }) => (
              <div className="min-w-0" key={label}>
                <dt className="text-muted">{label}</dt>
                <dd
                  className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]"
                  data-amount
                >
                  {formatRupiah(BigInt(amount.amountMinor))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted [overflow-wrap:anywhere]">
            <span data-amount>{formatRupiah(BigInt(guide.remaining.amountMinor))}</span> remaining ÷{" "}
            {guide.remainingDays} {guide.remainingDays === 1 ? "day" : "days"}, including{" "}
            {guideDate(asOf)}. The daily amount is rounded down to whole rupiah.
          </p>
        </div>
      </details>
    </li>
  );
}

export function CategorySpendingGuide({
  insights,
  month,
  today,
}: {
  insights?: FinancialInsights;
  month: string;
  today: string;
}) {
  if (
    !insights ||
    insights.asOf.slice(0, 7) !== month ||
    insights.asOf > today ||
    insights.safeToSpend.byCategory.length === 0
  ) {
    return null;
  }

  return (
    <section aria-labelledby="category-spending-guide-title" className="mt-5 min-w-0">
      <SectionTitle id="category-spending-guide-title" title="Daily guide by category" />
      <Card className="mt-2 block min-w-0 gap-0 rounded-2xl border border-border px-5">
        <p className="border-b border-separator py-4 text-xs leading-5 text-muted">
          {month < today.slice(0, 7) ? "Historical view as of " : "As of "}
          <time dateTime={insights.asOf}>{guideDate(insights.asOf)}</time> · Confirmed spending
        </p>
        <ul className="min-w-0 divide-y divide-separator">
          {insights.safeToSpend.byCategory.map((guide) => (
            <CategoryGuide asOf={insights.asOf} guide={guide} key={guide.budgetId} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

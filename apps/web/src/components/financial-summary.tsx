"use client";

import { Card } from "@monara/ui";
import { useId } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import styles from "@/components/financial-summary.module.css";
import { Icon, type IconName } from "@/components/icon";

import { chartRatio, type FinancialSummaryModel } from "@/data/finance-analytics";

function SummaryMetric({
  label,
  amount,
  icon,
  kind,
  scale,
}: {
  label: string;
  amount: bigint;
  icon: IconName;
  kind: "spending" | "income" | "net";
  scale: bigint;
}) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className={styles.metric} data-kind={kind}>
      <dt>
        <Icon className={styles.metricIcon} name={icon} />
        {label}
      </dt>
      <dd data-amount>{formatRupiah(amount)}</dd>
      {kind !== "net" ? (
        <span aria-hidden className={styles.track}>
          <span style={{ width: `${chartRatio(amount, scale) * 100}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function SummaryComparison({ comparison }: { comparison: FinancialSummaryModel["comparison"] }) {
  const { formatRupiah } = useAmountDisplay();
  if (comparison.state !== "available") return null;
  const change = comparison.change;
  const absoluteChange = change < BigInt(0) ? -change : change;
  const direction = change > BigInt(0) ? "more" : change < BigInt(0) ? "less" : "same";
  return (
    <figure
      aria-label={`Spending ${formatRupiah(absoluteChange)} ${direction}. ${comparison.basisLabel}.`}
      className={styles.comparison}
      data-direction={direction}
    >
      <Icon
        className={styles.comparisonIcon}
        name={direction === "more" ? "trend-up" : direction === "less" ? "trend-down" : "transfer"}
      />
      <strong data-amount>
        {change === BigInt(0)
          ? "No change"
          : `${change > BigInt(0) ? "+" : "−"}${formatRupiah(absoluteChange)}`}
      </strong>
      <span>vs {comparison.previousLabel}</span>
      {comparison.caption ? (
        <span className={styles.period}>
          <Icon className={styles.periodIcon} name="calendar" />
          {comparison.caption}
        </span>
      ) : null}
    </figure>
  );
}

/** Shared confirmed totals and comparison presentation, independent of calendar scale. */
export function FinancialSummary({ model }: { model: FinancialSummaryModel }) {
  const titleId = useId();
  const summary = model;
  const scale = summary.income > summary.spending ? summary.income : summary.spending;
  return (
    <Card aria-labelledby={titleId} className={styles.summary} role="region">
      <h2 className="sr-only" id={titleId}>
        {model.label} confirmed totals. Transfers excluded.
      </h2>
      <dl className={styles.metrics}>
        <SummaryMetric
          amount={summary.spending}
          icon="trend-up"
          kind="spending"
          label="Spending"
          scale={scale}
        />
        <SummaryMetric
          amount={summary.income}
          icon="income"
          kind="income"
          label="Income"
          scale={scale}
        />
        <SummaryMetric
          amount={summary.difference}
          icon="wallet"
          kind="net"
          label="Net"
          scale={scale}
        />
      </dl>
      <SummaryComparison comparison={model.comparison} />
    </Card>
  );
}

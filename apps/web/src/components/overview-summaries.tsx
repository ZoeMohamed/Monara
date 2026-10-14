"use client";

import type { CSSProperties, ReactNode } from "react";

import { Icon } from "@/components/icon";
import { categoryColor } from "@/data/category-style";
import { formatRupiah } from "@/data/demo-ledger";
import { chartRatio } from "@/data/finance-analytics";
import type { overviewModel } from "@/data/overview-model";

import styles from "./overview-summaries.module.css";

type OverviewModel = ReturnType<typeof overviewModel>;

function Tile({
  title,
  label,
  onPress,
  children,
}: {
  title: string;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button aria-label={label} className={styles.tile} onClick={onPress} type="button">
      <span className={styles.tileHead}>
        <span className={styles.title}>{title}</span>
        <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
      </span>
      {children}
    </button>
  );
}

function MoneyTile({ model, openReports }: { model: OverviewModel; openReports: () => void }) {
  const { income, spending, difference } = model.summary;
  const scale = income > spending ? income : spending;
  return (
    <Tile
      label={`Money in and out. Income ${formatRupiah(income)}, spending ${formatRupiah(spending)}, net income ${formatRupiah(difference)}. ${model.savingsRate === null ? "No confirmed income yet." : `Savings rate ${model.savingsRate}%.`} Open Reports.`}
      onPress={openReports}
      title="Money in & out"
    >
      <span className={styles.big}>{formatRupiah(difference)}</span>
      <span className={styles.note}>Net income</span>
      <span className={styles.flows}>
        <span className={styles.flowRow}>
          <span className={styles.flowLabel}>In</span>
          <span aria-hidden className={styles.flowTrack}>
            <span
              className={styles.flowIn}
              style={{ width: `${chartRatio(income, scale) * 100}%` }}
            />
          </span>
          <strong>{formatRupiah(income)}</strong>
        </span>
        <span className={styles.flowRow}>
          <span className={styles.flowLabel}>Out</span>
          <span aria-hidden className={styles.flowTrack}>
            <span
              className={styles.flowOut}
              style={{ width: `${chartRatio(spending, scale) * 100}%` }}
            />
          </span>
          <strong>{formatRupiah(spending)}</strong>
        </span>
      </span>
      <span className={styles.footnote}>
        {model.savingsRate === null
          ? "No confirmed income yet"
          : `Savings rate ${model.savingsRate}%`}
      </span>
    </Tile>
  );
}

function PaceRing({ used, elapsed, state }: { used: number; elapsed: number; state: string }) {
  return (
    <svg aria-hidden className={styles.pace} data-state={state} viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        <circle className={styles.paceTrack} cx="60" cy="60" r="48" />
        <circle
          className={styles.paceUsed}
          cx="60"
          cy="60"
          pathLength="100"
          r="48"
          strokeDasharray={`${Math.min(used, 100)} 100`}
        />
        <circle className={styles.elapsedTrack} cx="60" cy="60" r="36" />
        <circle
          className={styles.elapsed}
          cx="60"
          cy="60"
          pathLength="100"
          r="36"
          strokeDasharray={`${elapsed} 100`}
        />
      </g>
      <text className={styles.paceValue} textAnchor="middle" x="60" y="61">
        {used}%
      </text>
      <text className={styles.paceLabel} textAnchor="middle" x="60" y="77">
        used
      </text>
    </svg>
  );
}

function SafeTile({ model, openBudgets }: { model: OverviewModel; openBudgets: () => void }) {
  const { safeToSpend, percent, elapsedPercent } = model;
  const state =
    model.overBudgetCount > 0 ? "over" : percent > elapsedPercent ? "ahead" : "on-track";
  return (
    <Tile
      label={`${safeToSpend ? `Safe to spend today ${formatRupiah(safeToSpend.perDay)}. Total limits ${formatRupiah(safeToSpend.limit)} minus all confirmed expenses ${formatRupiah(safeToSpend.spending)} leaves ${formatRupiah(safeToSpend.remaining)} overall remaining, with a minimum of Rp0. Divided by ${safeToSpend.daysLeft} days including today.` : `Category budgets remaining ${formatRupiah(model.remaining)}.`} Outer ring: ${percent}% of category budgets used. Inner ring: ${elapsedPercent}% of month elapsed. Open Budgets.`}
      onPress={openBudgets}
      title={safeToSpend ? "Safe to spend today" : "Budget remaining"}
    >
      <span className={styles.safeBody}>
        <span className={styles.safeText}>
          <span className={styles.big}>
            {formatRupiah(safeToSpend ? safeToSpend.perDay : model.remaining)}
            {safeToSpend ? <small>/day</small> : null}
          </span>
          <span className={styles.note}>
            {safeToSpend
              ? `${formatRupiah(safeToSpend.remaining)} overall left ÷ ${safeToSpend.daysLeft} days, including today`
              : "Remaining category budgets"}
          </span>
        </span>
        <PaceRing elapsed={elapsedPercent} state={state} used={percent} />
      </span>
      {safeToSpend ? (
        <span className={styles.note}>Total limits minus all confirmed expenses; minimum Rp0.</span>
      ) : null}
      <span className={styles.footnote}>Outer: budget used · inner: month elapsed</span>
    </Tile>
  );
}

function BudgetTile({ model, openBudgets }: { model: OverviewModel; openBudgets: () => void }) {
  const attention = model.attentionBudget;
  const attentionText = attention
    ? attention.state === "over"
      ? `${attention.budget.category} · ${formatRupiah(-attention.remaining)} over budget`
      : attention.state === "at-limit"
        ? `${attention.budget.category} · at limit`
        : `${attention.budget.category} · ${formatRupiah(attention.remaining)} left, near limit`
    : "All categories on track";
  return (
    <Tile
      label={`Category budgets: ${model.usage.map((item) => `${item.budget.category} ${item.percent}% used`).join(", ")}. ${attentionText}. Open Budgets.`}
      onPress={openBudgets}
      title="Category budgets"
    >
      <span className={styles.rings}>
        {model.usage.map((item, index) => (
          <span className={styles.ringItem} data-state={item.state} key={item.budget.id}>
            <svg
              aria-hidden
              style={
                { "--ring-color": categoryColor(item.budget.category, index) } as CSSProperties
              }
              viewBox="0 0 48 48"
            >
              <g transform="rotate(-90 24 24)">
                <circle className={styles.miniTrack} cx="24" cy="24" r="20" />
                <circle
                  className={styles.miniUsed}
                  cx="24"
                  cy="24"
                  pathLength="100"
                  r="20"
                  strokeDasharray={`${Math.min(item.percent, 100)} 100`}
                />
              </g>
              <text className={styles.ringValue} textAnchor="middle" x="24" y="28">
                {item.percent}%
              </text>
            </svg>
            <span className={styles.ringName}>{item.budget.category}</span>
          </span>
        ))}
      </span>
      <span className={styles.note}>{formatRupiah(model.remaining)} remaining</span>
      <span className={styles.footnote} data-state={attention?.state}>
        {attentionText}
      </span>
    </Tile>
  );
}

export function OverviewSummaries({
  model,
  openReports,
  openBudgets,
}: {
  model: OverviewModel;
  openReports: () => void;
  openBudgets: () => void;
}) {
  return (
    <div className={styles.grid}>
      <MoneyTile model={model} openReports={openReports} />
      <SafeTile model={model} openBudgets={openBudgets} />
      <BudgetTile model={model} openBudgets={openBudgets} />
    </div>
  );
}

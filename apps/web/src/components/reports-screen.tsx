"use client";

import { Card } from "@monara/ui";
import { useId, useState } from "react";

import { EmptyLedgerState } from "@/components/empty-ledger-state";
import {
  CashFlowChart,
  CategoryBreakdown,
  SpendingCalendar,
  SpendingTrend,
} from "@/components/financial-visuals";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import styles from "@/components/reports-screen.module.css";
import { SpendingFlow } from "@/components/spending-flow";
import { TransactionRow } from "@/components/transaction-row";
import { SectionTitle, Wash } from "@/components/visual";
import {
  demoSummary,
  demoToday,
  formatMonth,
  formatRupiah,
  type Transaction,
} from "@/data/demo-ledger";
import { chartRatio, compactAmount, monthComparison } from "@/data/finance-analytics";
import { spendingPlaces } from "@/data/spending-flow";

function TopPlaces({
  transactions,
  month,
  openTransaction,
}: {
  transactions: Transaction[];
  month: string;
  openTransaction?: (transaction: Transaction) => void;
}) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const paymentsId = useId();
  const places = spendingPlaces(transactions, month).slice(0, 6);
  const selected = places.find((place) => place.name === selectedName);

  function openPlace(place: (typeof places)[number]) {
    if (place.transactions.length === 1 && openTransaction) {
      openTransaction(place.transactions[0]);
      return;
    }
    setSelectedName(selectedName === place.name ? null : place.name);
  }

  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-5">
      <SectionTitle title="Top places" />
      <ol className="mt-2 divide-y divide-separator">
        {places.map((place, index) => (
          <li key={place.name}>
            <button
              aria-controls={place.transactions.length > 1 ? paymentsId : undefined}
              aria-expanded={
                place.transactions.length > 1 ? selectedName === place.name : undefined
              }
              aria-label={`${place.name}, ${formatRupiah(place.amount)}, ${place.transactions.length} ${place.transactions.length === 1 ? "payment" : "payments"}. Show payments.`}
              className="relative isolate flex min-h-12 w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-2 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-out hover:bg-surface-secondary active:scale-[0.98] aria-expanded:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:active:scale-100 motion-reduce:transform-none"
              onClick={() => openPlace(place)}
              type="button"
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 -z-10 origin-left rounded-lg bg-accent/8 motion-safe:animate-[grow-x_700ms_var(--ease-out)_both]"
                style={{
                  width: `${Math.max(chartRatio(place.amount, places[0].amount) * 100, 4)}%`,
                  animationDelay: `${index * 70}ms`,
                }}
              />
              <span
                aria-hidden
                className="w-5 shrink-0 text-center text-xs font-semibold text-muted tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{place.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {place.transactions.length}×
              </span>
              <strong className="max-w-[43%] break-words text-right tabular-nums">
                {formatRupiah(place.amount)}
              </strong>
              <Icon aria-hidden className="h-3 w-3 shrink-0 text-muted" name="arrow" />
            </button>
          </li>
        ))}
      </ol>
      <section aria-live="polite" id={paymentsId}>
        {selected ? (
          <div className="mt-3 rounded-xl bg-surface-secondary p-3">
            <h3 className="text-sm font-semibold">{selected.name} payments</h3>
            <ul className="mt-1 divide-y divide-separator">
              {selected.transactions.map((transaction) => (
                <li key={transaction.id}>
                  {openTransaction ? (
                    <TransactionRow
                      onClick={() => openTransaction(transaction)}
                      showDate
                      transaction={transaction}
                    />
                  ) : (
                    <p className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                      <span>
                        {transaction.date} · {transaction.category ?? "Uncategorized"}
                      </span>
                      <strong className="tabular-nums">
                        {formatRupiah(transaction.amount ?? 0)}
                      </strong>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </Card>
  );
}

function ReportSummary({
  summary,
  transactions,
  month,
  today,
}: {
  summary: ReturnType<typeof demoSummary>;
  transactions: Transaction[];
  month: string;
  today: string;
}) {
  const comparison = monthComparison(transactions, month, today);
  const change = comparison.current - comparison.previous;
  const previousName = formatMonth(comparison.previousMonth).split(" ")[0];
  const spendingAmount = formatRupiah(summary.spending).replace(/^Rp\s*/, "");
  return (
    <Wash className={`${styles.summary} mt-4 p-5 sm:p-7`} tone="blue">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className={styles.summaryLabel}>Money out</p>
          <p
            className={`${styles.amount} break-words text-[clamp(2.25rem,6vw,3.75rem)] font-black leading-none tracking-[-0.06em] tabular-nums`}
          >
            <span>Rp</span>
            {spendingAmount}
          </p>
          <p className={`${styles.summaryMonth} mt-1 text-sm font-semibold text-muted`}>
            spent in {formatMonth(month)}
          </p>
          <p className={styles.mobileStats}>
            of <strong className="text-success">{compactAmount(summary.income)}</strong> income
            <span aria-hidden> · </span>
            <span>
              <strong>
                {compactAmount(
                  summary.difference < BigInt(0) ? -summary.difference : summary.difference,
                )}
              </strong>{" "}
              {summary.difference < BigInt(0) ? "over income" : "left"}
            </span>
          </p>
        </div>
      </div>
      <dl
        className={`${styles.desktopStats} mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs sm:grid-cols-3`}
      >
        <div className="min-w-0">
          <dt className="text-muted">Income</dt>
          <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
            {formatRupiah(summary.income)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Net income</dt>
          <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
            {compactAmount(summary.difference)}
          </dd>
        </div>
        {comparison.state === "available" ? (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-muted">
              Spending vs {previousName}
              {comparison.throughDay ? ` by day ${comparison.throughDay}` : ""}
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
              {change === BigInt(0)
                ? "Same spending"
                : `${compactAmount(change < BigInt(0) ? -change : change)} ${change > BigInt(0) ? "more" : "less"}`}
            </dd>
          </div>
        ) : null}
      </dl>
    </Wash>
  );
}

function BiggestExpenses({
  expenses,
  openTransaction,
}: {
  expenses: Transaction[];
  openTransaction?: (transaction: Transaction) => void;
}) {
  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-5">
      <SectionTitle title="Biggest expenses" />
      <ul className="mt-1 divide-y divide-separator">
        {expenses.map((item) => (
          <li key={item.id}>
            {openTransaction ? (
              <TransactionRow onClick={() => openTransaction(item)} showDate transaction={item} />
            ) : (
              <p className="flex justify-between gap-2 py-3 text-sm">
                {item.merchant ?? "Merchant unassigned"}
                <strong className="tabular-nums">{formatRupiah(item.amount ?? 0)}</strong>
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportsScreen({
  transactions,
  month,
  today = demoToday,
  setMonth,
  openTransaction,
  openAdd,
  openReview,
  openConnectGmail,
}: {
  transactions: Transaction[];
  month: string;
  today?: string;
  setMonth: (month: string) => void;
  openTransaction?: (transaction: Transaction) => void;
  openAdd?: () => void;
  openReview?: () => void;
  openConnectGmail?: () => void;
}) {
  const summary = demoSummary(transactions, month);
  const pendingCount = transactions.filter((item) => item.status === "pending").length;
  const hasFinancialActivity = summary.confirmed.some((item) => item.kind !== "transfer");
  const expenses = summary.confirmed.filter((item) => item.kind === "expense");
  const biggest = [...expenses]
    .sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0))
    .slice(0, 5);
  return (
    <div>
      <div className={`${styles.header} flex flex-wrap items-center justify-between gap-3`}>
        <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">Reports</h1>
        <MonthSelector currentMonth={today.slice(0, 7)} month={month} onChange={setMonth} />
      </div>
      {!hasFinancialActivity ? (
        <EmptyLedgerState
          onAdd={openAdd}
          onConnectGmail={openConnectGmail}
          onReview={openReview}
          pendingCount={pendingCount}
          title={
            transactions.length === 0
              ? "Start tracking"
              : summary.confirmed.length > 0
                ? "No income or expenses this month"
                : "No transactions this month"
          }
        />
      ) : (
        <>
          <ReportSummary
            key={`summary-${month}`}
            month={month}
            today={today}
            summary={summary}
            transactions={transactions}
          />
          <div
            className={`${styles.charts} mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]`}
            key={month}
          >
            <div className={`${styles.primaryColumn} min-w-0 space-y-4`}>
              {expenses.length > 0 ? (
                <div className={styles.chart}>
                  <SpendingTrend month={month} today={today} transactions={transactions} />
                </div>
              ) : null}
              <div className={`${styles.chart} ${styles.calendar}`}>
                <SpendingCalendar
                  month={month}
                  today={today}
                  onOpenTransaction={openTransaction}
                  transactions={transactions}
                />
              </div>
            </div>
            <div className={`${styles.secondaryColumn} min-w-0 space-y-4`}>
              {expenses.length > 0 ? (
                <div className={styles.chart}>
                  <CategoryBreakdown
                    month={month}
                    today={today}
                    onOpenTransaction={openTransaction}
                    transactions={transactions}
                  />
                </div>
              ) : null}
              <div className={styles.chart}>
                <CashFlowChart month={month} today={today} transactions={transactions} />
              </div>
            </div>
          </div>
          {expenses.length > 0 ? (
            <>
              <div className={`${styles.chart} ${styles.flow} mt-4`}>
                <SpendingFlow
                  key={month}
                  month={month}
                  onOpenTransaction={openTransaction}
                  transactions={transactions}
                />
              </div>
              <div className={`${styles.details} mt-4 grid items-start gap-4 lg:grid-cols-2`}>
                <div className={`${styles.chart} ${styles.places}`}>
                  <TopPlaces
                    key={month}
                    month={month}
                    openTransaction={openTransaction}
                    transactions={transactions}
                  />
                </div>
                <div className={styles.chart}>
                  <BiggestExpenses expenses={biggest} openTransaction={openTransaction} />
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

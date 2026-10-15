"use client";

import { Button, Card } from "@monara/ui";
import { useId, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { EmptyLedgerState } from "@/components/empty-ledger-state";
import { FinancialSummary } from "@/components/financial-summary";
import {
  CashFlowChart,
  CategoryBreakdown,
  SpendingCalendar,
  SpendingTrend,
} from "@/components/financial-visuals";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import periodStyles from "@/components/period-selector.module.css";
import styles from "@/components/reports-screen.module.css";
import { SpendingFlow } from "@/components/spending-flow";
import { TransactionRow } from "@/components/transaction-row";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { SectionTitle } from "@/components/visual";
import type { ReportPeriod } from "@/data/app-navigation";
import { categoryIcon } from "@/data/category-style";
import { demoSummary, demoToday, formatRupiah, type Transaction } from "@/data/demo-ledger";
import { financialSummaryModel, financialYear } from "@/data/finance-analytics";
import { biggestExpenses, spendingPlaces } from "@/data/spending-flow";

function PlaceMark({ name, category }: { name: string; category: string | null }) {
  const brand = useMerchantLogo(name);
  return brand ? (
    <BrandMark brand={brand} size={32} />
  ) : (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
    >
      <Icon className="h-4 w-4" name={categoryIcon(category ?? "Uncategorized")} />
    </span>
  );
}

function TopPlaces({
  transactions,
  period,
  openTransaction,
}: {
  transactions: Transaction[];
  period: string;
  openTransaction?: (transaction: Transaction) => void;
}) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const paymentsId = useId();
  const places = spendingPlaces(transactions, period).slice(0, 6);
  const selected = places.find((place) => place.name === selectedName);

  function openPlace(place: (typeof places)[number]) {
    if (place.transactions.length === 1 && openTransaction) {
      openTransaction(place.transactions[0]);
      return;
    }
    setSelectedName(selectedName === place.name ? null : place.name);
  }

  return (
    <Card className={styles.rankingCard}>
      <div className={styles.rankingHeading}>
        <SectionTitle title="Top places" />
        <p className="mt-1 text-sm text-muted">
          Total spent at each place this {period.length === 4 ? "year" : "month"}.
        </p>
      </div>
      <ol className={styles.rankingList}>
        {places.map((place, index) => (
          <li key={place.name}>
            <Button
              aria-controls={
                place.transactions.length > 1 || !openTransaction ? paymentsId : undefined
              }
              aria-expanded={
                place.transactions.length > 1 || !openTransaction
                  ? selectedName === place.name
                  : undefined
              }
              aria-label={`${place.name}, ${formatRupiah(place.amount)}, ${place.transactions.length} ${place.transactions.length === 1 ? "payment" : "payments"}. ${place.transactions.length === 1 && openTransaction ? "Open transaction." : "Show payments."}`}
              className={styles.placeRow}
              onPress={() => openPlace(place)}
              type="button"
              variant="ghost"
            >
              <span
                aria-hidden
                className="w-5 shrink-0 text-center text-xs font-semibold text-muted tabular-nums"
              >
                {index + 1}
              </span>
              <PlaceMark name={place.name} category={place.transactions[0]?.category ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{place.name}</span>
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  {place.transactions.length}{" "}
                  {place.transactions.length === 1 ? "payment" : "payments"}
                </span>
              </span>
              <strong className="max-w-[43%] text-right tabular-nums [overflow-wrap:anywhere]">
                {formatRupiah(place.amount)}
              </strong>
              <Icon aria-hidden className="h-3 w-3 shrink-0 text-muted" name="arrow" />
            </Button>
          </li>
        ))}
      </ol>
      <section aria-live="polite" id={paymentsId}>
        {selected ? (
          <div className={styles.selectedPlace}>
            <h3 className="px-5 pt-4 pb-2 text-sm font-semibold">{selected.name} payments</h3>
            <ul className={styles.rankingList}>
              {selected.transactions.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow
                    onClick={openTransaction ? () => openTransaction(transaction) : undefined}
                    showDate
                    transaction={transaction}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </Card>
  );
}

function BiggestExpenses({
  transactions,
  period,
  openTransaction,
}: {
  transactions: Transaction[];
  period: string;
  openTransaction?: (transaction: Transaction) => void;
}) {
  const payments = biggestExpenses(transactions, period).slice(0, 5);
  return (
    <Card className={styles.rankingCard}>
      <div className={styles.rankingHeading}>
        <SectionTitle title="Biggest expenses" />
        <p className="mt-1 text-sm text-muted">Largest single payments, highest first.</p>
      </div>
      <ol className={styles.rankingList}>
        {payments.map((transaction) => (
          <li key={transaction.id}>
            <TransactionRow
              onClick={openTransaction ? () => openTransaction(transaction) : undefined}
              showDate
              transaction={transaction}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function YearSelector({
  year,
  currentYear,
  onChange,
}: {
  year: string;
  currentYear: string;
  onChange: (year: string) => void;
}) {
  return (
    <fieldset aria-label="Selected year" className={periodStyles.selector}>
      <Button
        aria-label="Previous year"
        className={periodStyles.arrow}
        isDisabled={year === "0000"}
        isIconOnly
        onPress={() => onChange(String(Number(year) - 1).padStart(4, "0"))}
        variant="ghost"
      >
        <Icon name="chevron-left" />
      </Button>
      <span aria-live="polite" className={`${periodStyles.label} min-w-16`}>
        {year}
      </span>
      <Button
        aria-label="Next year"
        className={periodStyles.arrow}
        isDisabled={year >= currentYear}
        isIconOnly
        onPress={() => onChange(String(Number(year) + 1).padStart(4, "0"))}
        variant="ghost"
      >
        <Icon name="chevron-right" />
      </Button>
    </fieldset>
  );
}

function ReportPeriodSelector({
  period,
  onChange,
}: {
  period: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}) {
  return (
    <fieldset aria-label="Report period" className={styles.periodTabs}>
      {(["monthly", "yearly"] as const).map((value) => (
        <Button
          aria-pressed={period === value}
          className="min-h-11 min-w-0 flex-1 rounded-xl px-4 text-sm"
          key={value}
          onPress={() => onChange(value)}
          variant={period === value ? "secondary" : "ghost"}
        >
          {value === "monthly" ? "Monthly" : "Yearly"}
        </Button>
      ))}
    </fieldset>
  );
}

type ReportDataProps = {
  transactions: Transaction[];
  month: string;
  today: string;
  openTransaction?: (transaction: Transaction) => void;
};

function MonthlyCharts({ transactions, month, today, openTransaction }: ReportDataProps) {
  const expenses = demoSummary(transactions, month).spending > BigInt(0);
  return (
    <>
      <div
        className={`${styles.charts} mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]`}
      >
        <div className={`${styles.primaryColumn} min-w-0 space-y-4`}>
          {expenses && (
            <div className={styles.chart}>
              <SpendingTrend month={month} today={today} transactions={transactions} />
            </div>
          )}
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
          {expenses && (
            <div className={styles.chart}>
              <CategoryBreakdown
                month={month}
                today={today}
                onOpenTransaction={openTransaction}
                transactions={transactions}
              />
            </div>
          )}
          <div className={styles.chart}>
            <CashFlowChart month={month} today={today} transactions={transactions} />
          </div>
        </div>
      </div>
      {expenses && (
        <div className={`${styles.chart} ${styles.flow} mt-4`}>
          <SpendingFlow
            month={month}
            onOpenTransaction={openTransaction}
            transactions={transactions}
          />
        </div>
      )}
    </>
  );
}

function YearlyCharts({
  transactions,
  year,
  today,
  openTransaction,
}: Omit<ReportDataProps, "month"> & { year: string }) {
  const expenses = financialYear(transactions, year, today).spending > BigInt(0);
  return (
    <div
      className={`${styles.charts} mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]`}
    >
      <div className={styles.chart}>
        <CashFlowChart key={year} year={year} today={today} transactions={transactions} />
      </div>
      {expenses && (
        <div className={styles.chart}>
          <CategoryBreakdown
            key={year}
            year={year}
            today={today}
            onOpenTransaction={openTransaction}
            transactions={transactions}
          />
        </div>
      )}
    </div>
  );
}

function ExpenseRankings({
  transactions,
  period,
  openTransaction,
}: Pick<ReportDataProps, "transactions" | "openTransaction"> & { period: string }) {
  return (
    <div className={`${styles.places} mt-4 grid items-start gap-4 lg:grid-cols-2`}>
      <div className="min-w-0">
        <TopPlaces
          key={period}
          period={period}
          openTransaction={openTransaction}
          transactions={transactions}
        />
      </div>
      <div className="min-w-0">
        <BiggestExpenses
          period={period}
          openTransaction={openTransaction}
          transactions={transactions}
        />
      </div>
    </div>
  );
}

export function ReportsScreen({
  transactions,
  month,
  today = demoToday,
  setMonth,
  reportPeriod,
  reportYear,
  setReportPeriod,
  setReportYear,
  openTransaction,
  openAdd,
  openReview,
  openConnectGmail,
}: {
  transactions: Transaction[];
  month: string;
  today?: string;
  setMonth: (month: string) => void;
  reportPeriod: ReportPeriod;
  reportYear: string;
  setReportPeriod: (period: ReportPeriod) => void;
  setReportYear: (year: string) => void;
  openTransaction?: (transaction: Transaction) => void;
  openAdd?: () => void;
  openReview?: () => void;
  openConnectGmail?: () => void;
}) {
  const yearly = reportPeriod === "yearly";
  const period = yearly ? reportYear : month;
  const model = financialSummaryModel(transactions, period, today);
  const pendingCount = transactions.filter((item) => item.status === "pending").length;
  const hasFinancialActivity = model.income > BigInt(0) || model.spending > BigInt(0);
  return (
    <div className="min-w-0">
      <div className={`${styles.header} flex flex-wrap items-center justify-between gap-3`}>
        <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">Reports</h1>
        <div className={styles.controls}>
          <ReportPeriodSelector period={reportPeriod} onChange={setReportPeriod} />
          {yearly ? (
            <YearSelector
              year={reportYear}
              currentYear={today.slice(0, 4)}
              onChange={setReportYear}
            />
          ) : (
            <MonthSelector currentMonth={today.slice(0, 7)} month={month} onChange={setMonth} />
          )}
        </div>
      </div>
      {!hasFinancialActivity ? (
        <EmptyLedgerState
          onAdd={openAdd}
          onConnectGmail={openConnectGmail}
          onReview={openReview}
          pendingCount={pendingCount}
          title={`No income or expenses in ${model.label}`}
        />
      ) : (
        <>
          <FinancialSummary model={model} />
          <div className={styles.reportBody}>
            {yearly ? (
              <YearlyCharts
                transactions={transactions}
                year={reportYear}
                today={today}
                openTransaction={openTransaction}
              />
            ) : (
              <MonthlyCharts
                key={month}
                transactions={transactions}
                month={month}
                today={today}
                openTransaction={openTransaction}
              />
            )}
            {model.spending > BigInt(0) && (
              <ExpenseRankings
                transactions={transactions}
                period={period}
                openTransaction={openTransaction}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

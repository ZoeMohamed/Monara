"use client";

import { Button } from "@monara/ui";

import { EmptyLedgerState } from "@/components/empty-ledger-state";
import { CategoryBreakdown, SpendingTrend } from "@/components/financial-visuals";
import { MonthSelector } from "@/components/month-selector";
import { OverviewHero } from "@/components/overview-hero";
import { OverviewSummaries } from "@/components/overview-summaries";
import { TransactionRow } from "@/components/transaction-row";
import { SectionTitle } from "@/components/visual";
import { demoMonth, type RecurringBill, type Reminder, type Transaction } from "@/data/demo-ledger";
import { overviewModel } from "@/data/overview-model";
import { budgets } from "@/data/sample-data";

function RecentTransactions({
  transactions,
  openTransaction,
  openTransactions,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  openTransactions: () => void;
}) {
  return (
    <section
      aria-labelledby="recent-transactions"
      className="rounded-3xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SectionTitle id="recent-transactions" title="Recent transactions" />
        </div>
        <Button
          className="-mr-2 min-h-11 rounded-full text-accent"
          onPress={openTransactions}
          size="sm"
          variant="ghost"
        >
          See all
        </Button>
      </div>
      <ul className="mt-1 divide-y divide-separator">
        {transactions.map((item) => (
          <li key={item.id}>
            <TransactionRow onClick={() => openTransaction(item)} showDate transaction={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverviewReminders({
  reminders,
  openReminders,
}: {
  reminders: Reminder[];
  openReminders: () => void;
}) {
  return (
    <section
      aria-labelledby="home-reminders"
      className="rounded-3xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SectionTitle id="home-reminders" title="Coming up" />
        </div>
        <Button
          className="-mr-2 rounded-full text-accent"
          onPress={openReminders}
          size="sm"
          variant="ghost"
        >
          Reminders
        </Button>
      </div>
      {reminders.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {reminders.slice(0, 2).map((reminder, index) => (
            <li
              className={`flex items-start gap-3 rounded-2xl p-3 text-sm leading-5 motion-safe:animate-[rise-in_420ms_var(--ease-out)_both] ${reminder.kind === "budget" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground"}`}
              key={reminder.id}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${reminder.kind === "budget" ? "bg-warning" : "bg-accent"}`}
              />
              {reminder.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No reminders.</p>
      )}
    </section>
  );
}

export function DashboardScreen({
  month,
  setMonth,
  transactions,
  bills = [],
  reminders,
  openTransaction,
  openReview,
  openReminders,
  openReports,
  openTransactions,
  openBudgets,
  openChat,
  openAdd,
  openConnectGmail,
}: {
  month: string;
  setMonth: (month: string) => void;
  transactions: Transaction[];
  bills?: RecurringBill[];
  reminders: Reminder[];
  openTransaction: (transaction: Transaction) => void;
  openReview: () => void;
  openReminders: () => void;
  openReports: () => void;
  openTransactions: () => void;
  openBudgets: () => void;
  openChat: () => void;
  openAdd?: () => void;
  openConnectGmail?: () => void;
}) {
  const model = overviewModel(transactions, budgets, bills, month);
  const { hasFinancialActivity, pendingCount, recent, expenseCount } = model;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Overview</h1>
        <MonthSelector month={month} onChange={setMonth} />
      </div>

      <OverviewHero
        month={month}
        model={model}
        openChat={openChat}
        openReports={openReports}
        openReview={openReview}
      />

      {!hasFinancialActivity ? (
        <>
          <EmptyLedgerState
            onAdd={openAdd}
            onConnectGmail={openConnectGmail}
            onReview={openReview}
            pendingCount={pendingCount}
            title={model.emptyTitle}
          />
          {recent.length > 0 ? (
            <div className="mt-4">
              <RecentTransactions
                openTransaction={openTransaction}
                openTransactions={openTransactions}
                transactions={recent}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <OverviewSummaries model={model} openBudgets={openBudgets} openReports={openReports} />

          <div
            className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
            key={month}
          >
            <div className="min-w-0 space-y-4">
              {expenseCount > 0 ? (
                <SpendingTrend month={month} transactions={transactions} />
              ) : null}
              <RecentTransactions
                openTransaction={openTransaction}
                openTransactions={openTransactions}
                transactions={recent}
              />
            </div>
            <div className="min-w-0 space-y-4">
              {expenseCount > 0 ? (
                <CategoryBreakdown
                  month={month}
                  onOpenTransaction={openTransaction}
                  transactions={transactions}
                />
              ) : null}
              {month === demoMonth ? (
                <OverviewReminders reminders={reminders} openReminders={openReminders} />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

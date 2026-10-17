"use client";

import type { FinancialAccount } from "@monara/contracts";
import { Button, Card, InputGroup, Label, TextField } from "@monara/ui";
import { useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import { FinancialSummary } from "@/components/financial-summary";
import { Icon, type IconName } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { TransactionRow } from "@/components/transaction-row";
import styles from "@/components/transactions-screen.module.css";
import type { LedgerKind } from "@/data/app-navigation";
import { demoToday, formatMonth, type Transaction, transactionErrors } from "@/data/demo-ledger";

import { financialSummaryModel } from "@/data/finance-analytics";

type KindFilter = LedgerKind;

// With nothing selected the list shows everything, so there is no "All" chip. The icons
// match the summary card: the arrow for spending, the tray for income.
const kindFilters: { id: Exclude<KindFilter, "all">; label: string; icon: IconName }[] = [
  { id: "expense", label: "Expenses", icon: "trend-up" },
  { id: "income", label: "Income", icon: "income" },
  { id: "exclusion", label: "Exclusions", icon: "eye-off" },
];

const ledgerDayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const undatedKey = "undated";

/** Newest day first. Imports with no date have no day to sit under, so they lead the list. */
function groupByDate(transactions: Transaction[]) {
  const groups = new Map<string, { transactions: Transaction[]; spending: bigint }>();
  for (const transaction of transactions) {
    const key = transaction.date ?? undatedKey;
    const group = groups.get(key) ?? { transactions: [], spending: BigInt(0) };
    group.transactions.push(transaction);
    if (transaction.status === "confirmed" && transaction.kind === "expense") {
      group.spending += BigInt(transaction.amount ?? 0);
    }
    groups.set(key, group);
  }
  return [...groups].sort(([first], [second]) =>
    first === undatedKey ? -1 : second === undatedKey ? 1 : second.localeCompare(first),
  );
}

function filteredTransactions(transactions: Transaction[], query: string, kind: KindFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return transactions
    .filter(
      (transaction) =>
        (kind === "all" || transaction.kind === kind) &&
        `${transaction.merchant ?? ""} ${transaction.category ?? ""} ${transaction.method ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
    )
    .sort((first, second) =>
      `${second.date ?? ""} ${second.time ?? ""}`.localeCompare(
        `${first.date ?? ""} ${first.time ?? ""}`,
      ),
    );
}

function LedgerFilters({
  query,
  kindFilter,
  reviewOpen,
  pendingCount,
  onQueryChange,
  onKindChange,
  onReviewChange,
}: {
  query: string;
  kindFilter: KindFilter;
  reviewOpen: boolean;
  pendingCount: number;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: KindFilter) => void;
  onReviewChange: (open: boolean) => void;
}) {
  const chip = (active: boolean) =>
    `h-9 min-h-9 min-w-0 shrink-0 gap-1.5 rounded-full px-3.5 text-xs font-bold ${active ? "bg-foreground text-white" : "bg-surface-secondary text-foreground"}`;
  return (
    <>
      <TextField className="mt-3 min-w-0" onChange={onQueryChange} value={query}>
        <Label className="sr-only">Search</Label>
        <InputGroup className="rounded-2xl">
          <InputGroup.Prefix>
            <Icon name="search" />
          </InputGroup.Prefix>
          <InputGroup.Input
            className="text-base"
            enterKeyHint="search"
            placeholder="Merchant, category or account"
            type="search"
          />
        </InputGroup>
      </TextField>
      <fieldset
        aria-label="Filter transactions"
        className="mt-2 flex min-w-0 gap-2 max-lg:-mx-5 max-lg:overflow-x-auto max-lg:px-5 max-lg:[scrollbar-width:none] lg:flex-wrap"
      >
        <Button
          aria-label={`To review, ${pendingCount} waiting`}
          aria-pressed={reviewOpen}
          className={chip(reviewOpen)}
          onPress={() => onReviewChange(!reviewOpen)}
          variant="ghost"
        >
          <Icon className="h-4 w-4" name="inbox" />
          To review
          {pendingCount > 0 ? (
            <span
              aria-hidden
              className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground tabular-nums"
            >
              {pendingCount}
            </span>
          ) : null}
        </Button>
        {kindFilters.map((filter) => {
          const active = !reviewOpen && kindFilter === filter.id;
          return (
            <Button
              aria-pressed={active}
              className={chip(active)}
              key={filter.id}
              onPress={() => onKindChange(active ? "all" : filter.id)}
              variant="ghost"
            >
              <Icon className="h-4 w-4" name={filter.icon} />
              {filter.label}
            </Button>
          );
        })}
      </fieldset>
    </>
  );
}

function LedgerResultCount({
  visibleCount,
  totalCount,
  filtersActive,
  onClear,
}: {
  visibleCount: number;
  totalCount: number;
  filtersActive: boolean;
  onClear: () => void;
}) {
  // The count is read out to screen readers always, and shown only while a filter narrows the list.
  const count = (
    <p className={filtersActive ? "text-xs text-muted" : "sr-only"} role="status">
      {visibleCount} {visibleCount === 1 ? "transaction" : "transactions"}
      {filtersActive ? ` of ${totalCount}` : ""}
    </p>
  );
  if (!filtersActive) return count;
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
      {count}
      {visibleCount > 0 || totalCount === 0 ? (
        <Button
          className="h-9 min-h-9 rounded-full text-xs text-accent"
          onPress={onClear}
          size="sm"
          variant="ghost"
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

/** The Financial Account a transaction was paid from, by id and then by the name it carries. */
function accountOf(transaction: Transaction, accounts: FinancialAccount[]) {
  return (
    accounts.find((account) => account.id === transaction.financialAccountId) ??
    accounts.find((account) => account.name === transaction.method)
  );
}

function GroupedLedger({
  transactions,
  accounts,
  openTransaction,
  onConfirm,
}: {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  openTransaction: (transaction: Transaction) => void;
  onConfirm: (id: string) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="mt-2 space-y-3">
      {groupByDate(transactions).map(([date, group]) => (
        <section aria-labelledby={`ledger-day-${date}`} key={date}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-1 lg:px-5">
            <h2 className="min-w-0 text-sm font-semibold" id={`ledger-day-${date}`}>
              {date === undatedKey ? (
                "No date"
              ) : (
                <time dateTime={date}>
                  {ledgerDayFormatter.format(new Date(`${date}T00:00:00Z`))}
                </time>
              )}
            </h2>
            {group.spending > BigInt(0) ? (
              <p className="text-xs font-medium text-muted tabular-nums [overflow-wrap:anywhere]">
                −{formatRupiah(group.spending)}
              </p>
            ) : null}
          </div>
          <div className={styles.ledgerGroup}>
            {group.transactions.map((transaction) => (
              <TransactionRow
                account={accountOf(transaction, accounts)}
                key={transaction.id}
                onClick={() => openTransaction(transaction)}
                onConfirm={
                  transaction.status === "pending" &&
                  Object.keys(transactionErrors(transaction)).length === 0
                    ? () => onConfirm(transaction.id)
                    : undefined
                }
                transaction={transaction}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EmptyLedger({
  month,
  reviewing,
  noTransactions,
  onClear,
  onAdd,
  onReview,
  onConnectGmail,
}: {
  month: string;
  reviewing: boolean;
  noTransactions: boolean;
  onClear: () => void;
  onAdd?: () => void;
  onReview?: () => void;
  onConnectGmail?: () => void;
}) {
  if (reviewing && noTransactions) {
    return (
      <Card className="mt-3 block min-w-0 gap-0 rounded-3xl border border-dashed border-border bg-surface p-5 text-center">
        <h2 className="text-base font-bold">You’re all caught up.</h2>
        <p className="mt-1 text-sm text-muted">Imports wait here until you confirm them.</p>
      </Card>
    );
  }
  return (
    <Card className="mt-3 block min-w-0 gap-0 rounded-3xl border border-dashed border-border bg-surface p-5 text-center">
      <h2 className="text-base font-bold">{noTransactions ? "No transactions" : "No matches"}</h2>
      <p className="mt-1 text-sm text-muted">
        {noTransactions
          ? `Add a transaction for ${formatMonth(month)}${onReview ? " or review your imports" : ""}.`
          : "Try another search or clear your filters."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {noTransactions ? (
          <>
            {onAdd ? (
              <Button className="min-h-11" onPress={onAdd}>
                <Icon name="plus" />
                Add transaction
              </Button>
            ) : null}
            {onReview ? (
              <Button className="min-h-11" onPress={onReview} variant="secondary">
                Review imports
              </Button>
            ) : onConnectGmail ? (
              <Button className="min-h-11" onPress={onConnectGmail} variant="secondary">
                Connect Gmail
              </Button>
            ) : null}
          </>
        ) : (
          <Button className="min-h-11" onPress={onClear} variant="secondary">
            Clear filters
          </Button>
        )}
      </div>
    </Card>
  );
}

function Ledger({
  transactions,
  month,
  today,
  accounts,
  reviewOpen,
  pendingCount,
  openTransaction,
  query,
  kindFilter,
  onQueryChange,
  onKindChange,
  onReviewChange,
  onConfirm,
  onClearFilters,
  onAdd,
  onConnectGmail,
}: {
  transactions: Transaction[];
  month: string;
  today: string;
  accounts: FinancialAccount[];
  reviewOpen: boolean;
  pendingCount: number;
  openTransaction: (transaction: Transaction) => void;
  query: string;
  kindFilter: KindFilter;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: KindFilter) => void;
  onReviewChange: (open: boolean) => void;
  onConfirm: (id: string) => void;
  onClearFilters: () => void;
  onAdd?: () => void;
  onConnectGmail?: () => void;
}) {
  // To review lists every import waiting, whatever its month; the other filters stay in the month.
  const ledger = reviewOpen
    ? transactions.filter((transaction) => transaction.status === "pending")
    : transactions.filter((transaction) => transaction.date?.startsWith(`${month}-`));
  const visible = filteredTransactions(ledger, query, reviewOpen ? "all" : kindFilter);
  const filtersActive = query.trim().length > 0 || (!reviewOpen && kindFilter !== "all");

  return (
    <>
      {reviewOpen ? null : (
        <FinancialSummary compact model={financialSummaryModel(transactions, month, today)} />
      )}
      <LedgerFilters
        query={query}
        kindFilter={kindFilter}
        reviewOpen={reviewOpen}
        pendingCount={pendingCount}
        onQueryChange={onQueryChange}
        onKindChange={onKindChange}
        onReviewChange={onReviewChange}
      />
      <LedgerResultCount
        visibleCount={visible.length}
        totalCount={ledger.length}
        filtersActive={filtersActive}
        onClear={onClearFilters}
      />
      {visible.length > 0 ? (
        <GroupedLedger
          accounts={accounts}
          transactions={visible}
          openTransaction={openTransaction}
          onConfirm={onConfirm}
        />
      ) : (
        <EmptyLedger
          month={month}
          reviewing={reviewOpen}
          noTransactions={ledger.length === 0}
          onClear={onClearFilters}
          onAdd={onAdd}
          onReview={pendingCount > 0 ? () => onReviewChange(true) : undefined}
          onConnectGmail={onConnectGmail}
        />
      )}
    </>
  );
}

export function TransactionsScreen({
  transactions,
  openTransaction,
  reviewOpen,
  setReviewOpen,
  financialAccounts = [],
  onConfirm,
  month,
  today = demoToday,
  setMonth,
  query: controlledQuery,
  kindFilter: controlledKindFilter,
  onQueryChange,
  onKindChange,
  onClearFilters,
  onAdd,
  onConnectGmail,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  reviewOpen: boolean;
  setReviewOpen: (value: boolean) => void;
  financialAccounts?: FinancialAccount[];
  onConfirm: (id: string) => void;
  month: string;
  today?: string;
  setMonth: (month: string) => void;
  query?: string;
  kindFilter?: KindFilter;
  onQueryChange?: (query: string) => void;
  onKindChange?: (kind: KindFilter) => void;
  onClearFilters?: () => void;
  onAdd?: () => void;
  onConnectGmail?: () => void;
}) {
  const [filters, setFilters] = useState<{ query: string; kind: KindFilter }>({
    query: "",
    kind: "all",
  });
  const query = controlledQuery ?? filters.query;
  const kindFilter = controlledKindFilter ?? filters.kind;
  const pendingCount = transactions.filter((item) => item.status === "pending").length;

  function changeQuery(value: string) {
    if (onQueryChange) onQueryChange(value);
    else setFilters((current) => ({ ...current, query: value }));
  }

  // Picking a type leaves To review, so the chips act as one choice.
  function changeKind(value: KindFilter) {
    if (onKindChange) onKindChange(value);
    else {
      setFilters((current) => ({ ...current, kind: value }));
      setReviewOpen(false);
    }
  }

  function clearFilters() {
    if (onClearFilters) onClearFilters();
    else {
      onQueryChange?.("");
      onKindChange?.("all");
      setFilters({ query: "", kind: "all" });
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">
          <span className="lg:hidden">History</span>
          <span className="max-lg:hidden">Transactions</span>
        </h1>
        {!reviewOpen ? (
          <MonthSelector month={month} currentMonth={today.slice(0, 7)} onChange={setMonth} />
        ) : null}
      </div>
      <Ledger
        transactions={transactions}
        month={month}
        today={today}
        accounts={financialAccounts}
        reviewOpen={reviewOpen}
        pendingCount={pendingCount}
        openTransaction={openTransaction}
        query={query}
        kindFilter={kindFilter}
        onQueryChange={changeQuery}
        onKindChange={changeKind}
        onReviewChange={setReviewOpen}
        onConfirm={onConfirm}
        onClearFilters={clearFilters}
        onAdd={onAdd}
        onConnectGmail={onConnectGmail}
      />
    </div>
  );
}

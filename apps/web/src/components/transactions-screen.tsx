"use client";

import { Button, Card, InputGroup, Label, TextField } from "@monara/ui";
import { useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import { FinancialSummary } from "@/components/financial-summary";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { ReviewQueue } from "@/components/review-queue";
import { TransactionRow } from "@/components/transaction-row";
import styles from "@/components/transactions-screen.module.css";
import type { LedgerKind } from "@/data/app-navigation";
import { demoToday, formatMonth, type Transaction } from "@/data/demo-ledger";

import { financialSummaryModel } from "@/data/finance-analytics";

type KindFilter = LedgerKind;

const kindFilters: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "exclusion", label: "Exclusions" },
];

const ledgerDayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function groupByDate(transactions: Transaction[]) {
  const groups = new Map<string, { transactions: Transaction[]; spending: bigint }>();
  for (const transaction of transactions) {
    if (!transaction.date) continue;
    const group = groups.get(transaction.date) ?? { transactions: [], spending: BigInt(0) };
    group.transactions.push(transaction);
    if (transaction.status === "confirmed" && transaction.kind === "expense") {
      group.spending += BigInt(transaction.amount ?? 0);
    }
    groups.set(transaction.date, group);
  }
  return [...groups].sort(([first], [second]) => second.localeCompare(first));
}

function filteredTransactions(transactions: Transaction[], query: string, kind: KindFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return transactions
    .filter(
      (transaction) =>
        transaction.status === "confirmed" &&
        (kind === "all" || transaction.kind === kind) &&
        `${transaction.merchant ?? ""} ${transaction.category ?? ""} ${transaction.method ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
    )
    .sort((first, second) =>
      `${second.date} ${second.time ?? ""}`.localeCompare(`${first.date} ${first.time ?? ""}`),
    );
}

function TransactionViewSelector({
  reviewOpen,
  pendingCount,
  onChange,
}: {
  reviewOpen: boolean;
  pendingCount: number;
  onChange: (review: boolean) => void;
}) {
  const tab = (active: boolean) =>
    `min-h-11 w-full min-w-0 rounded-xl px-3 text-sm font-semibold ${active ? "bg-surface text-foreground shadow-sm" : "text-muted"}`;
  return (
    <fieldset
      aria-label="Transaction view"
      className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-secondary p-1"
    >
      <Button
        aria-pressed={!reviewOpen}
        className={tab(!reviewOpen)}
        onPress={() => onChange(false)}
        variant="ghost"
      >
        History
      </Button>
      <Button
        aria-label={`To review, ${pendingCount} waiting`}
        aria-pressed={reviewOpen}
        className={tab(reviewOpen)}
        onPress={() => onChange(true)}
        variant="ghost"
      >
        To review
        {pendingCount > 0 ? (
          <span
            aria-hidden
            className="grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11px] font-bold text-warning-foreground tabular-nums"
          >
            {pendingCount}
          </span>
        ) : null}
      </Button>
    </fieldset>
  );
}

function LedgerFilters({
  query,
  kindFilter,
  onQueryChange,
  onKindChange,
}: {
  query: string;
  kindFilter: KindFilter;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: KindFilter) => void;
}) {
  return (
    <>
      <TextField className="mt-4 min-w-0" onChange={onQueryChange} value={query}>
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
        aria-label="Filter by transaction type"
        className="mt-3 flex min-w-0 gap-2 max-lg:-mx-5 max-lg:overflow-x-auto max-lg:px-5 max-lg:[scrollbar-width:none] lg:flex-wrap"
      >
        {kindFilters.map((filter) => (
          <Button
            aria-pressed={kindFilter === filter.id}
            className={`min-h-11 min-w-0 shrink-0 rounded-full px-4 text-xs font-bold ${kindFilter === filter.id ? "bg-foreground text-white" : "bg-surface-secondary text-foreground"}`}
            key={filter.id}
            onPress={() => onKindChange(filter.id)}
            variant="ghost"
          >
            {filter.label}
          </Button>
        ))}
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
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted" role="status">
        {visibleCount} {visibleCount === 1 ? "transaction" : "transactions"}
        {filtersActive ? ` of ${totalCount}` : ""}
      </p>
      {filtersActive && (visibleCount > 0 || totalCount === 0) ? (
        <Button
          className="min-h-11 rounded-full text-xs text-accent"
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

function GroupedLedger({
  transactions,
  openTransaction,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="mt-3 space-y-4">
      {groupByDate(transactions).map(([date, group]) => (
        <section aria-labelledby={`ledger-day-${date}`} key={date}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2 lg:px-5">
            <h2 className="min-w-0 text-sm font-semibold" id={`ledger-day-${date}`}>
              <time dateTime={date}>
                {ledgerDayFormatter.format(new Date(`${date}T00:00:00Z`))}
              </time>
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
                key={transaction.id}
                onClick={() => openTransaction(transaction)}
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
  noConfirmed,
  onClear,
  onAdd,
  onReview,
  onConnectGmail,
}: {
  month: string;
  noConfirmed: boolean;
  onClear: () => void;
  onAdd?: () => void;
  onReview?: () => void;
  onConnectGmail?: () => void;
}) {
  return (
    <Card className="mt-3 block min-w-0 gap-0 rounded-3xl border border-dashed border-border bg-surface p-5 text-center">
      <h2 className="text-base font-bold">
        {noConfirmed ? "No confirmed transactions" : "No matches"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {noConfirmed
          ? `Add a transaction for ${formatMonth(month)}${onReview ? " or review your imports" : ""}.`
          : "Try another search or clear your filters."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {noConfirmed ? (
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

function ConfirmedLedger({
  transactions,
  month,
  today,
  openTransaction,
  query,
  kindFilter,
  onQueryChange,
  onKindChange,
  onClearFilters,
  onAdd,
  onReview,
  onConnectGmail,
}: {
  transactions: Transaction[];
  month: string;
  today: string;
  openTransaction: (transaction: Transaction) => void;
  query: string;
  kindFilter: KindFilter;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: KindFilter) => void;
  onClearFilters: () => void;
  onAdd?: () => void;
  onReview?: () => void;
  onConnectGmail?: () => void;
}) {
  const ledger = transactions.filter(
    (transaction) =>
      transaction.date?.startsWith(`${month}-`) && transaction.status === "confirmed",
  );
  const visible = filteredTransactions(ledger, query, kindFilter);
  const filtersActive = query.trim().length > 0 || kindFilter !== "all";

  return (
    <>
      <FinancialSummary model={financialSummaryModel(transactions, month, today)} />
      <LedgerFilters
        query={query}
        kindFilter={kindFilter}
        onQueryChange={onQueryChange}
        onKindChange={onKindChange}
      />
      <LedgerResultCount
        visibleCount={visible.length}
        totalCount={ledger.length}
        filtersActive={filtersActive}
        onClear={onClearFilters}
      />
      {visible.length > 0 ? (
        <GroupedLedger transactions={visible} openTransaction={openTransaction} />
      ) : (
        <EmptyLedger
          month={month}
          noConfirmed={ledger.length === 0}
          onClear={onClearFilters}
          onAdd={onAdd}
          onReview={onReview}
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
  onEdit,
  onConfirm,
  onReject,
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
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
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

  function changeKind(value: KindFilter) {
    if (onKindChange) onKindChange(value);
    else setFilters((current) => ({ ...current, kind: value }));
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
      <TransactionViewSelector
        reviewOpen={reviewOpen}
        pendingCount={pendingCount}
        onChange={setReviewOpen}
      />
      {reviewOpen ? (
        <ReviewQueue
          transactions={transactions}
          onEdit={onEdit}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      ) : (
        <ConfirmedLedger
          transactions={transactions}
          month={month}
          today={today}
          openTransaction={openTransaction}
          query={query}
          kindFilter={kindFilter}
          onQueryChange={changeQuery}
          onKindChange={changeKind}
          onClearFilters={clearFilters}
          onAdd={onAdd}
          onReview={pendingCount > 0 ? () => setReviewOpen(true) : undefined}
          onConnectGmail={onConnectGmail}
        />
      )}
    </div>
  );
}

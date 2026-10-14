"use client";

import { Button, Card, InputGroup, Label, TextField } from "@monara/ui";
import { useState } from "react";

import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { ReviewQueue } from "@/components/review-queue";
import { TransactionRow } from "@/components/transaction-row";
import { Wash } from "@/components/visual";
import type { LedgerKind } from "@/data/app-navigation";
import { categoryColor } from "@/data/category-style";
import { demoSummary, formatMonth, formatRupiah, type Transaction } from "@/data/demo-ledger";
import { chartRatio, financialMonth } from "@/data/finance-analytics";

type KindFilter = LedgerKind;

const kindFilters: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfers" },
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
    if (transaction.kind === "expense") group.spending += BigInt(transaction.amount ?? 0);
    groups.set(transaction.date, group);
  }
  return [...groups].sort(([first], [second]) => second.localeCompare(first));
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
  return (
    <fieldset
      aria-label="Transaction view"
      className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-secondary p-1"
    >
      <Button
        aria-pressed={!reviewOpen}
        className={`min-h-11 min-w-0 rounded-xl px-2 text-xs sm:text-sm ${reviewOpen ? "text-muted" : "bg-surface text-foreground"}`}
        onPress={() => onChange(false)}
        variant="ghost"
      >
        Confirmed
      </Button>
      <Button
        aria-pressed={reviewOpen}
        className={`min-h-11 min-w-0 rounded-xl px-2 text-xs sm:text-sm ${reviewOpen ? "bg-surface text-foreground" : "text-muted"}`}
        onPress={() => onChange(true)}
        variant="ghost"
      >
        Review Queue · {pendingCount}
      </Button>
    </fieldset>
  );
}

function LedgerSummary({
  summary,
  categories,
}: {
  summary: ReturnType<typeof demoSummary>;
  categories: ReturnType<typeof financialMonth>["categories"];
}) {
  return (
    <Wash className="mt-4 p-4 sm:p-5" tone="blue">
      <p className="text-sm font-medium text-muted">Confirmed spending</p>
      <p className="mt-2 text-3xl font-bold tracking-[-0.04em] tabular-nums [overflow-wrap:anywhere] sm:text-4xl">
        {formatRupiah(summary.spending)}
      </p>
      <p className="mt-2 text-sm text-muted">
        Income{" "}
        <span className="font-medium text-foreground tabular-nums">
          {formatRupiah(summary.income)}
        </span>
        {" · "}transfers excluded
      </p>
      {categories.length > 0 ? (
        <>
          <div aria-hidden className="mt-4 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
            {categories.map((category, index) => (
              <span
                className="h-full"
                key={category.name}
                style={{
                  flexGrow: chartRatio(category.amount, summary.spending) * 1000,
                  background: categoryColor(category.name, index),
                }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            {categories.map((category, index) => (
              <li className="flex items-center gap-1.5" key={category.name}>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: categoryColor(category.name, index) }}
                />
                {category.name}{" "}
                <span className="tabular-nums">
                  {Math.round(chartRatio(category.amount, summary.spending) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Wash>
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
      <fieldset aria-label="Filter by transaction type" className="mt-3 flex flex-wrap gap-2">
        {kindFilters.map((filter) => (
          <Button
            aria-pressed={kindFilter === filter.id}
            className={`min-h-11 min-w-0 rounded-full px-4 text-xs font-bold ${kindFilter === filter.id ? "bg-foreground text-white" : "bg-surface-secondary text-foreground"}`}
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
  return (
    <div className="mt-3 space-y-4">
      {groupByDate(transactions).map(([date, group]) => (
        <section aria-labelledby={`ledger-day-${date}`} key={date}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2">
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
          <div className="divide-y divide-separator rounded-3xl border border-border bg-surface px-3">
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
  const summary = demoSummary(transactions, month);
  const visible = filteredTransactions(summary.confirmed, query, kindFilter);
  const filtersActive = query.trim().length > 0 || kindFilter !== "all";

  return (
    <>
      <LedgerSummary
        categories={financialMonth(transactions, month).categories}
        summary={summary}
      />
      <LedgerFilters
        query={query}
        kindFilter={kindFilter}
        onQueryChange={onQueryChange}
        onKindChange={onKindChange}
      />
      <LedgerResultCount
        visibleCount={visible.length}
        totalCount={summary.confirmed.length}
        filtersActive={filtersActive}
        onClear={onClearFilters}
      />
      {visible.length > 0 ? (
        <GroupedLedger transactions={visible} openTransaction={openTransaction} />
      ) : (
        <EmptyLedger
          month={month}
          noConfirmed={summary.confirmed.length === 0}
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
        <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Transactions</h1>
        {!reviewOpen ? <MonthSelector month={month} onChange={setMonth} /> : null}
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

"use client";

import { Button, Card, InputGroup, Label, TextField } from "@monara/ui";
import { useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { FinancialSummary } from "@/components/financial-summary";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { ReviewRow } from "@/components/review-queue";
import { TransactionRow } from "@/components/transaction-row";
import styles from "@/components/transactions-screen.module.css";
import type { LedgerKind } from "@/data/app-navigation";
import { demoToday, formatMonth, type Transaction } from "@/data/demo-ledger";
import { financialSummaryModel } from "@/data/finance-analytics";
import { filterHistory, groupHistory, historyForMonth } from "@/data/ledger-history";

const kindFilters: { id: LedgerKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "exclusion", label: "Exclusions" },
];

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function HistoryFilters({
  query,
  kind,
  reviewOnly,
  pendingCount,
  onQuery,
  onFilter,
}: {
  query: string;
  kind: LedgerKind;
  reviewOnly: boolean;
  pendingCount: number;
  onQuery: (value: string) => void;
  onFilter: (kind: LedgerKind, review: boolean) => void;
}) {
  const buttonClass = (active: boolean) =>
    `min-h-11 min-w-0 shrink-0 gap-1 rounded-full px-2.5 text-[11px] font-bold ${active ? "bg-foreground text-white" : "bg-surface-secondary text-foreground"}`;
  return (
    <>
      <TextField className="mt-4 min-w-0" onChange={onQuery} value={query}>
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
        className="mt-3 flex min-w-0 gap-1 max-lg:-mx-5 max-lg:overflow-x-auto max-lg:px-5 max-lg:[scrollbar-width:none] lg:flex-wrap"
      >
        {kindFilters.map((filter) => (
          <Button
            aria-pressed={!reviewOnly && kind === filter.id}
            className={buttonClass(!reviewOnly && kind === filter.id)}
            key={filter.id}
            onPress={() => onFilter(filter.id, false)}
            variant="ghost"
          >
            {filter.label}
          </Button>
        ))}
        <Button
          aria-pressed={reviewOnly}
          className={buttonClass(reviewOnly)}
          onPress={() => onFilter("all", true)}
          variant="ghost"
        >
          To review
          {pendingCount > 0 ? <span className={styles.reviewCount}>{pendingCount}</span> : null}
        </Button>
      </fieldset>
    </>
  );
}

function GroupedLedger({
  transactions,
  openTransaction,
  onEdit,
  onConfirm,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="mt-3 space-y-4">
      {groupHistory(transactions).map(([date, group]) => (
        <section aria-labelledby={`ledger-day-${date}`} key={date}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2 lg:px-5">
            <h2 className="text-xs font-semibold text-muted" id={`ledger-day-${date}`}>
              {date === "undated" ? (
                "Date needed"
              ) : (
                <time dateTime={date}>{dayFormatter.format(new Date(`${date}T00:00:00Z`))}</time>
              )}
            </h2>
            {group.spending > BigInt(0) ? (
              <p className="text-xs font-medium text-muted tabular-nums">
                −{formatRupiah(group.spending)}
              </p>
            ) : null}
          </div>
          <div className={styles.ledgerGroup}>
            {group.transactions.map((transaction) =>
              transaction.status === "pending" ? (
                <ReviewRow
                  key={transaction.id}
                  transaction={transaction}
                  onOpen={() => openTransaction(transaction)}
                  onEdit={() => onEdit(transaction.id)}
                  onConfirm={() => onConfirm(transaction.id)}
                />
              ) : (
                <TransactionRow
                  key={transaction.id}
                  onClick={() => openTransaction(transaction)}
                  transaction={transaction}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

type EmptyHistoryProps = {
  month: string;
  empty: boolean;
  reviewOnly: boolean;
  pendingCount: number;
  onClear: () => void;
  onAdd?: () => void;
  onConnectGmail?: () => void;
};

function emptyHistoryContent({ month, empty, reviewOnly, pendingCount }: EmptyHistoryProps) {
  if (reviewOnly && pendingCount === 0)
    return {
      title: "You’re all caught up",
      body: "No transactions need review in this month.",
      button: "See all transactions",
    };
  if (empty)
    return {
      title: "No transactions yet",
      body: `Your transactions for ${formatMonth(month)} will show up here.`,
      button: "Clear filters",
    };
  return {
    title: "No matches",
    body: "Try another search or clear your filters.",
    button: "Clear filters",
  };
}

function EmptyHistoryActions({ props, button }: { props: EmptyHistoryProps; button: string }) {
  const { empty, reviewOnly, onAdd, onConnectGmail, onClear } = props;
  if (!empty || reviewOnly)
    return (
      <Button className="min-h-11" onPress={onClear} variant="secondary">
        {button}
      </Button>
    );
  return (
    <>
      {onAdd ? (
        <Button className="min-h-11" onPress={onAdd}>
          <Icon name="plus" />
          Add transaction
        </Button>
      ) : null}
      {onConnectGmail ? (
        <Button className="min-h-11" onPress={onConnectGmail} variant="secondary">
          Connect Gmail
        </Button>
      ) : null}
    </>
  );
}

function EmptyHistory(props: EmptyHistoryProps) {
  const content = emptyHistoryContent(props);
  return (
    <Card className="mt-3 block gap-0 rounded-3xl border border-dashed border-border bg-surface p-5 text-center">
      <h2 className="text-base font-bold">{content.title}</h2>
      <p className="mt-1 text-sm text-muted">{content.body}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <EmptyHistoryActions props={props} button={content.button} />
      </div>
    </Card>
  );
}

export function TransactionsScreen({
  transactions,
  openTransaction,
  reviewOpen,
  onFilterChange,
  onEdit,
  onConfirm,
  month,
  today = demoToday,
  setMonth,
  query: controlledQuery,
  kindFilter: controlledKind,
  onQueryChange,
  onClearFilters,
  onAdd,
  onConnectGmail,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  reviewOpen: boolean;
  onFilterChange: (kind: LedgerKind, review: boolean) => void;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  month: string;
  today?: string;
  setMonth: (month: string) => void;
  query?: string;
  kindFilter?: LedgerKind;
  onQueryChange?: (query: string) => void;
  onClearFilters?: () => void;
  onAdd?: () => void;
  onConnectGmail?: () => void;
}) {
  const [filters, setFilters] = useState<{ query: string; kind: LedgerKind }>({
    query: "",
    kind: "all",
  });
  const query = controlledQuery ?? filters.query;
  const kind = controlledKind ?? filters.kind;
  const records = historyForMonth(transactions, month);
  const visible = filterHistory(records, query, kind, reviewOpen);
  const pendingCount = records.filter((item) => item.status === "pending").length;
  const active = !!query.trim() || kind !== "all" || reviewOpen;
  const changeQuery = (value: string) =>
    onQueryChange ? onQueryChange(value) : setFilters((current) => ({ ...current, query: value }));
  const changeFilter = (value: LedgerKind, review: boolean) => {
    onFilterChange(value, review);
    if (controlledKind === undefined) setFilters((current) => ({ ...current, kind: value }));
  };
  const clear = () => {
    if (onClearFilters) onClearFilters();
    else {
      changeQuery("");
      changeFilter("all", false);
    }
  };
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">
          <span className="lg:hidden">History</span>
          <span className="max-lg:hidden">Transactions</span>
        </h1>
        <MonthSelector month={month} currentMonth={today.slice(0, 7)} onChange={setMonth} />
      </div>
      <FinancialSummary compact model={financialSummaryModel(transactions, month, today)} />
      <HistoryFilters
        query={query}
        kind={kind}
        reviewOnly={reviewOpen}
        pendingCount={pendingCount}
        onQuery={changeQuery}
        onFilter={changeFilter}
      />
      <div className="mt-2 flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs text-muted" role="status">
          {visible.length} {visible.length === 1 ? "transaction" : "transactions"}
          {reviewOpen ? " to review" : ""}
        </p>
        {active ? (
          <Button
            className="min-h-11 rounded-full text-xs text-accent"
            onPress={clear}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      {pendingCount > 0 && kind !== "exclusion" ? (
        <p className="text-[11px] text-muted">
          Highlighted transactions need review before they count toward totals.
        </p>
      ) : null}
      {kind === "exclusion" ? (
        <p className="text-[11px] text-muted">
          Kept in your history, left out of spending and budgets.
        </p>
      ) : null}
      {visible.length ? (
        <GroupedLedger
          transactions={visible}
          openTransaction={openTransaction}
          onEdit={onEdit}
          onConfirm={onConfirm}
        />
      ) : (
        <EmptyHistory
          month={month}
          empty={records.length === 0}
          reviewOnly={reviewOpen}
          pendingCount={pendingCount}
          onClear={clear}
          onAdd={onAdd}
          onConnectGmail={onConnectGmail}
        />
      )}
    </div>
  );
}

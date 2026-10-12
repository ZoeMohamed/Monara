"use client";

import { Alert, Button, Card, InputGroup, Label, TextField } from "@monara/ui";

import Image from "next/image";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BudgetsScreen } from "@/components/budgets-screen";
import { ChatScreen } from "@/components/chat-screen";
import { Icon, type IconName } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { ProfileScreen } from "@/components/profile-screen";
import { ReviewQueue } from "@/components/review-queue";
import { TransactionEditor } from "@/components/transaction-editor";
import {
  daysInMonth,
  demoMonth,
  demoReminders,
  demoSummary,
  demoToday,
  formatDay,
  formatMonth,
  newestFirst,
  type Reminder,
  rejectPendingTransaction,
  shiftMonth,
  type TransactionValues,
  transactionErrors,
  updatePendingTransaction,
} from "@/data/demo-ledger";
import {
  budgets,
  formatRupiah,
  initialBills,
  initialTransactions,
  type Transaction,
} from "@/data/sample-data";

type Tab = "home" | "transactions" | "budgets" | "chat" | "account";
type TabItem = { id: Tab; label: string; icon: IconName };

const tabs: TabItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "budgets", label: "Budgets", icon: "budgets" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "account", label: "Profile", icon: "account" },
];

const typeNames = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;

const budgetTotal = budgets.reduce((sum, budget) => sum + BigInt(budget.limit), BigInt(0));
const oldestMonth = shiftMonth(demoMonth, -12);

// No agent endpoint exists yet (AR1). Fail clearly rather than inventing a reply.
const sendToAgent = (): Promise<string> =>
  Promise.reject(
    new Error("The Monara Agent isn't connected in this preview yet. Nothing was changed."),
  );

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,
  );
}

function Logo() {
  return (
    <Image
      src="/logos/monara-lockup-light.svg"
      alt="Monara"
      width={704}
      height={142}
      className="h-8 w-auto shrink-0 object-contain sm:h-10"
    />
  );
}

function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: Transaction;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className="group h-auto min-h-11 w-full justify-start gap-3 rounded-xl px-0 py-2.5 text-left sm:px-3"
      onPress={onClick}
      type="button"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-base">
        {transaction.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">
          {transaction.merchant ?? "Merchant or source missing"}
        </span>
        <span className="mt-0.5 block truncate text-xs font-normal text-muted">
          {transaction.category ?? "Category not assigned"} ·{" "}
          {transaction.method ?? "Account not assigned"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`block text-sm font-bold tabular-nums ${transaction.kind === "income" ? "text-success" : "text-foreground"}`}
        >
          {transaction.amount === null
            ? "Amount missing"
            : `${transaction.kind === "income" ? "+" : ""}${formatRupiah(transaction.amount)}`}
        </span>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-normal text-muted">
          {transaction.kind === "transfer" ? "Transfer · " : null}
          {transaction.time}
        </span>
      </span>
    </Button>
  );
}

function ReminderList({ reminders }: { reminders: Reminder[] }) {
  return (
    <ul className="divide-y divide-separator">
      {reminders.map((reminder) => (
        <li className="flex gap-2.5 py-3 text-sm" key={reminder.id}>
          <Icon
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            name={reminder.kind === "budget" ? "budgets" : "bell"}
          />
          {reminder.message}
        </li>
      ))}
    </ul>
  );
}

function HomeView({
  month,
  setMonth,
  transactions,
  reminders,
  openTransaction,
  openReview,
  openReminders,
}: {
  month: string;
  setMonth: (month: string) => void;
  transactions: Transaction[];
  reminders: Reminder[];
  openTransaction: (transaction: Transaction) => void;
  openReview: () => void;
  openReminders: () => void;
}) {
  const summary = demoSummary(transactions, month);
  const percent =
    budgetTotal > BigInt(0) ? Number((summary.spending * BigInt(100)) / budgetTotal) : 0;
  const left = budgetTotal - summary.spending;
  const daysCounted = month === demoMonth ? Number(demoToday.slice(8, 10)) : daysInMonth(month);
  const pendingCount = transactions.filter((item) => item.status === "pending").length;
  const recent = [...summary.confirmed].sort(newestFirst).slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-muted">Monthly overview</p>
          <h1 aria-live="polite" className="text-xl font-black tracking-[-0.04em] sm:text-3xl">
            {formatMonth(month)}
          </h1>
        </div>
        <div className="flex gap-1">
          <Button
            aria-label="Previous month"
            className="rounded-full"
            isDisabled={month === oldestMonth}
            isIconOnly
            onPress={() => setMonth(shiftMonth(month, -1))}
            variant="ghost"
          >
            <Icon name="chevron-left" />
          </Button>
          <Button
            aria-label="Next month"
            className="rounded-full"
            isDisabled={month === demoMonth}
            isIconOnly
            onPress={() => setMonth(shiftMonth(month, 1))}
            variant="ghost"
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
      </div>

      <Card className="mt-3 block gap-0 rounded-2xl bg-accent-soft p-4 text-foreground">
        <p className="text-xs font-semibold text-accent-soft-foreground">Spent</p>
        <p className="mt-0.5 [overflow-wrap:anywhere] text-[clamp(1.875rem,9vw,2.5rem)] font-black leading-tight tracking-[-0.055em] tabular-nums">
          {formatRupiah(summary.spending)}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-accent-soft-foreground tabular-nums [overflow-wrap:anywhere]">
          <span>
            {percent}% of {formatRupiah(budgetTotal)}
          </span>
          <span>
            {left >= BigInt(0)
              ? `${formatRupiah(left)} left`
              : `${formatRupiah(-left)} over budget`}
          </span>
        </div>
        <div
          aria-label="Monthly budget used"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.min(percent, 100)}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent/15"
          role="progressbar"
        >
          <div
            className={`h-full rounded-full ${percent >= 100 ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-accent/15 pt-3 tabular-nums">
          <div className="min-w-0">
            <dt className="text-xs text-accent-soft-foreground">Income</dt>
            <dd className="mt-0.5 [overflow-wrap:anywhere] text-sm font-bold">
              {formatRupiah(summary.income)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-accent-soft-foreground">Income − spending</dt>
            <dd className="mt-0.5 [overflow-wrap:anywhere] text-sm font-bold">
              {formatRupiah(summary.difference)}
            </dd>
          </div>
          <div className="col-span-2 text-xs text-accent-soft-foreground">
            {formatRupiah(summary.spending / BigInt(daysCounted))} a day on average over{" "}
            {daysCounted} days
          </div>
        </dl>
      </Card>

      {pendingCount > 0 ? (
        <Button
          className="mt-2 h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left"
          onPress={openReview}
          variant="ghost"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-warning-soft text-sm font-bold text-warning-soft-foreground tabular-nums">
            {pendingCount}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">
              {pendingCount === 1 ? "Import needs review" : "Imports need review"}
            </span>
            <span className="block text-xs font-normal text-muted">
              Nothing counts until you confirm it
            </span>
          </span>
          <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
        </Button>
      ) : null}

      {month === demoMonth && reminders.length > 0 ? (
        <section aria-labelledby="home-reminders" className="mt-5">
          <div className="flex items-center justify-between">
            <h2 id="home-reminders" className="text-base font-black tracking-[-0.03em]">
              Reminders
            </h2>
            <Button className="-mr-2 text-accent" onPress={openReminders} size="sm" variant="ghost">
              See all
            </Button>
          </div>
          <Card className="mt-1 block gap-0 rounded-2xl border border-border px-4 py-1">
            <ReminderList reminders={reminders.slice(0, 2)} />
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="recent-transactions" className="mt-5">
        <h2 id="recent-transactions" className="text-base font-black tracking-[-0.03em]">
          Recent transactions
        </h2>
        <Card className="mt-2 block gap-0 rounded-2xl border border-border bg-surface px-4 py-0.5 sm:px-2">
          {recent.length > 0 ? (
            <div className="divide-y divide-separator">
              {recent.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  onClick={() => openTransaction(transaction)}
                  transaction={transaction}
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">
              No confirmed transactions in {formatMonth(month)}.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

function TransactionsView({
  transactions,
  openTransaction,
  reviewOpen,
  setReviewOpen,
  onEdit,
  onConfirm,
  onReject,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  reviewOpen: boolean;
  setReviewOpen: (value: boolean) => void;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const pendingCount = transactions.filter((item) => item.status === "pending").length;
  const visible = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.status === "confirmed" &&
            `${transaction.merchant ?? ""} ${transaction.category ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(newestFirst),
    [query, transactions],
  );

  return (
    <div>
      <h1 className="text-2xl font-black tracking-[-0.05em] sm:text-4xl">Transactions</h1>
      <fieldset
        aria-label="Transaction view"
        className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-secondary p-1"
      >
        <Button
          aria-pressed={!reviewOpen}
          className={`min-h-11 rounded-xl ${reviewOpen ? "text-muted" : "bg-surface text-foreground"}`}
          onPress={() => setReviewOpen(false)}
          variant="ghost"
        >
          Confirmed
        </Button>
        <Button
          aria-pressed={reviewOpen}
          className={`min-h-11 rounded-xl ${reviewOpen ? "bg-surface text-foreground" : "text-muted"}`}
          onPress={() => setReviewOpen(true)}
          variant="ghost"
        >
          Review Queue · {pendingCount}
        </Button>
      </fieldset>
      {reviewOpen ? (
        <ReviewQueue
          transactions={transactions}
          onEdit={onEdit}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      ) : (
        <>
          <TextField className="mt-3" onChange={setQuery} value={query}>
            <Label className="sr-only">Search transactions</Label>
            <InputGroup className="rounded-2xl">
              <InputGroup.Prefix>
                <Icon name="search" />
              </InputGroup.Prefix>
              <InputGroup.Input
                className="text-base"
                enterKeyHint="search"
                placeholder="Search merchants or categories"
              />
            </InputGroup>
          </TextField>
          <Card className="mt-3 block gap-0 rounded-2xl border border-border bg-surface px-4 py-0.5 sm:px-2">
            {visible.length > 0 ? (
              <div className="divide-y divide-separator">
                {visible.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    onClick={() => openTransaction(transaction)}
                    transaction={transaction}
                  />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">No matching transactions.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function RemindersSheet({ reminders, onClose }: { reminders: Reminder[]; onClose: () => void }) {
  return (
    <ModalDialog labelledBy="reminders-title" onClose={onClose}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="reminders-title" className="text-lg font-black tracking-[-0.03em]">
            Reminders
          </h2>
          <Button
            aria-label="Close reminders"
            className="rounded-full"
            isIconOnly
            onPress={onClose}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {reminders.length > 0 ? (
          <div className="mt-2">
            <ReminderList reminders={reminders} />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">You’re all caught up.</p>
        )}
        <p className="mt-2 text-xs text-muted">
          Budgets alert at 80% and 100%. Bills remind 3 days before and on the due date.
        </p>
      </div>
    </ModalDialog>
  );
}

function DesktopSidebar({
  activeTab,
  onSelect,
  reminderCount,
  onOpenReminders,
}: {
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
  reminderCount: number;
  onOpenReminders: () => void;
}) {
  return (
    <aside className="hidden border-r border-border bg-surface-secondary p-6 lg:flex lg:flex-col">
      <Logo />
      <nav aria-label="Main navigation" className="mt-12 space-y-2">
        {tabs.map((tab) => (
          <Button
            variant="ghost"
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
              activeTab === tab.id
                ? "bg-accent text-white"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            type="button"
          >
            <Icon name={tab.icon} /> {tab.label}
          </Button>
        ))}
      </nav>
      <Button
        variant="ghost"
        className="mt-4 h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-muted hover:bg-surface hover:text-foreground"
        onPress={() => onOpenReminders()}
      >
        <Icon name="bell" /> Reminders
        {reminderCount > 0 ? (
          <span className="ml-auto rounded-full bg-warning-soft px-2 text-xs text-warning-soft-foreground tabular-nums">
            {reminderCount}
          </span>
        ) : null}
      </Button>
      <p className="mt-auto flex items-start gap-2 text-xs leading-5 text-muted">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" name="shield" />
        Demo data stays local during this session.
      </p>
    </aside>
  );
}

function MobileHeader({
  activeTab,
  reminderCount,
  onOpenReminders,
  onOpenProfile,
}: {
  activeTab: Tab;
  reminderCount: number;
  onOpenReminders: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center justify-between border-b border-border bg-background pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(.5rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)] sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] lg:hidden">
      <Logo />
      <div className="flex items-center">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={reminderCount > 0 ? `Reminders, ${reminderCount} active` : "Reminders"}
          className="relative rounded-full text-foreground"
          onPress={() => onOpenReminders()}
          type="button"
        >
          <Icon name="bell" />
          {reminderCount > 0 ? (
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-warning ring-2 ring-background" />
          ) : null}
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          aria-current={activeTab === "account" ? "page" : undefined}
          aria-label="Profile and settings"
          className={`rounded-full ${activeTab === "account" ? "text-accent" : "text-foreground"}`}
          onPress={() => onOpenProfile()}
          type="button"
        >
          <Icon name="account" />
        </Button>
      </div>
    </header>
  );
}

function BottomNav({
  activeTab,
  onSelect,
  onAdd,
}: {
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
  onAdd: () => void;
}) {
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pl-[max(.5rem,env(safe-area-inset-left,0px))] pr-[max(.5rem,env(safe-area-inset-right,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-1.5 lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {tabs.slice(0, 2).map((tab) => (
          <MobileTab
            active={activeTab === tab.id}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            tab={tab}
          />
        ))}
        <Button
          isIconOnly
          variant="primary"
          aria-label="Add transaction"
          className="mx-auto -mt-6 grid h-13 w-13 place-items-center rounded-2xl bg-brand text-white"
          onPress={() => onAdd()}
          type="button"
        >
          <Icon className="h-6 w-6" name="plus" strokeWidth={2.2} />
        </Button>
        {tabs.slice(2, 4).map((tab) => (
          <MobileTab
            active={activeTab === tab.id}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            tab={tab}
          />
        ))}
      </div>
    </nav>
  );
}

function RejectDialog({
  transaction,
  onCancel,
  onReject,
}: {
  transaction: Transaction;
  onCancel: () => void;
  onReject: () => void;
}) {
  return (
    <ModalDialog labelledBy="reject-title" onClose={onCancel}>
      <div className="p-4 sm:p-5">
        <h2 id="reject-title" className="text-xl font-bold">
          Reject this transaction?
        </h2>
        <p className="mt-3 break-words text-sm leading-6 text-muted">
          {transaction.merchant ?? "This transaction"} will leave the Review Queue and stay out of
          totals. Rejection is retained for this demo session.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2 sm:mt-6 sm:gap-3">
          <Button variant="secondary" className="min-h-11" onPress={onCancel}>
            Keep pending
          </Button>
          <Button variant="danger" className="min-h-11" onPress={onReject}>
            Reject transaction
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function MonaraApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const mainRef = useRef<HTMLElement>(null);
  const previousTab = useRef<Tab>("home");
  useEffect(() => {
    if (previousTab.current === activeTab) return;
    previousTab.current = activeTab;
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
  }, [activeTab]);
  const [month, setMonth] = useState(demoMonth);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [bills, setBills] = useState(initialBills);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const online = useOnlineStatus();
  const reminders = demoReminders(transactions, budgets, bills);
  const selected = transactions.find(
    (item) => item.id === selectedId && item.status !== "rejected",
  );
  const editing = transactions.find((item) => item.id === editId && item.status === "pending");
  const rejecting = transactions.find((item) => item.id === rejectId && item.status === "pending");
  const openTransaction = (transaction: Transaction) => setSelectedId(transaction.id);
  const openReview = () => {
    setActiveTab("transactions");
    setReviewOpen(true);
  };
  const confirm = (id: string) => {
    const item = transactions.find(
      (transaction) => transaction.id === id && transaction.status === "pending",
    );
    if (!item) return;
    if (Object.keys(transactionErrors(item)).length > 0) {
      setEditId(id);
      return;
    }
    setTransactions((items) => updatePendingTransaction(items, id, item, "confirm"));
    setSelectedId(null);
    setNotice(`${item.merchant ?? "Transaction"} confirmed. Sample totals updated.`);
  };
  const save = (values: TransactionValues, action: "edit" | "confirm") => {
    if (!editing) return;
    setTransactions((items) => updatePendingTransaction(items, editing.id, values, action));
    setEditId(null);
    setSelectedId(null);
    setNotice(
      action === "confirm"
        ? "Transaction confirmed. Sample totals updated."
        : "Changes saved. Transaction is still pending review.",
    );
  };
  const add = (values: TransactionValues) => {
    setTransactions((items) => [
      { ...values, id: crypto.randomUUID(), emoji: "✦", confidence: null, status: "confirmed" },
      ...items,
    ]);
    setAddOpen(false);
    setActiveTab("transactions");
    setReviewOpen(false);
    setNotice("Sample transaction saved and confirmed for this session.");
  };
  const confirmBill = (id: string) => {
    setBills((items) =>
      items.map((bill) => (bill.id === id ? { ...bill, status: "active" } : bill)),
    );
    setNotice("Recurring bill tracked for this session.");
  };
  const dismissBill = (id: string) => {
    setBills((items) => items.filter((bill) => bill.id !== id));
    setNotice("Suggestion dismissed. It won't be tracked.");
  };

  return (
    <div className="min-h-dvh bg-surface-tertiary text-foreground lg:p-4">
      <div className="mx-auto min-h-dvh max-w-[1500px] overflow-clip bg-background lg:grid lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-[248px_minmax(0,1fr)] lg:rounded-[2rem] lg:border lg:border-border">
        <DesktopSidebar
          activeTab={activeTab}
          onOpenReminders={() => setRemindersOpen(true)}
          onSelect={setActiveTab}
          reminderCount={reminders.length}
        />

        <div className="min-w-0">
          <MobileHeader
            activeTab={activeTab}
            onOpenProfile={() => setActiveTab("account")}
            onOpenReminders={() => setRemindersOpen(true)}
            reminderCount={reminders.length}
          />

          {!online ? (
            <Alert className="rounded-none px-4 py-2 sm:px-5" role="status" status="warning">
              <Alert.Content>
                <Alert.Title className="text-center text-xs">
                  You’re offline. Reconnect for sign-in, sync, and real financial operations.
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ) : null}

          <p
            role="status"
            className={`mx-auto max-w-[920px] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-2 text-xs sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] sm:pt-4 lg:px-12 ${notice ? "font-semibold text-accent" : "text-muted"}`}
          >
            {notice || "Demo · synthetic data · changes reset when you leave or reload"}
          </p>
          <main
            ref={mainRef}
            tabIndex={-1}
            aria-label={tabs.find((tab) => tab.id === activeTab)?.label}
            className="mx-auto w-full max-w-[920px] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3 sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] sm:pt-6 lg:px-12 lg:pb-16 lg:pt-8"
          >
            {activeTab === "home" ? (
              <HomeView
                month={month}
                openReminders={() => setRemindersOpen(true)}
                openReview={openReview}
                openTransaction={openTransaction}
                reminders={reminders}
                setMonth={setMonth}
                transactions={transactions}
              />
            ) : null}
            {activeTab === "transactions" ? (
              <TransactionsView
                openTransaction={openTransaction}
                transactions={transactions}
                reviewOpen={reviewOpen}
                setReviewOpen={setReviewOpen}
                onEdit={setEditId}
                onConfirm={confirm}
                onReject={setRejectId}
              />
            ) : null}
            {activeTab === "budgets" ? (
              <BudgetsScreen
                bills={bills}
                budgets={budgets}
                onConfirmBill={confirmBill}
                onDismissBill={dismissBill}
                transactions={transactions}
              />
            ) : null}
            {activeTab === "chat" ? <ChatScreen onSend={sendToAgent} /> : null}
            {activeTab === "account" ? <ProfileScreen online={online} /> : null}
          </main>
        </div>
      </div>

      <BottomNav activeTab={activeTab} onAdd={() => setAddOpen(true)} onSelect={setActiveTab} />

      {activeTab !== "chat" ? (
        <Button
          variant="primary"
          aria-label="Add transaction"
          className="fixed bottom-8 right-8 z-30 hidden h-auto items-center gap-2 rounded-2xl bg-accent px-5 py-4 text-sm font-bold text-white lg:flex"
          onPress={() => setAddOpen(true)}
          type="button"
        >
          <Icon name="plus" /> Add transaction
        </Button>
      ) : null}

      {selected ? (
        <TransactionSheet onClose={() => setSelectedId(null)} transaction={selected} />
      ) : null}
      {editing && (
        <TransactionEditor
          key={editing.id}
          transaction={editing}
          onClose={() => setEditId(null)}
          onSave={save}
        />
      )}
      {rejecting ? (
        <RejectDialog
          onCancel={() => setRejectId(null)}
          onReject={() => {
            setTransactions((items) => rejectPendingTransaction(items, rejecting.id));
            setRejectId(null);
            setSelectedId(null);
            setNotice("Transaction rejected and removed from the Review Queue.");
          }}
          transaction={rejecting}
        />
      ) : null}
      {remindersOpen ? (
        <RemindersSheet onClose={() => setRemindersOpen(false)} reminders={reminders} />
      ) : null}
      {addOpen ? <TransactionEditor onClose={() => setAddOpen(false)} onSave={add} /> : null}
    </div>
  );
}

function MobileTab({
  tab,
  active,
  onClick,
}: {
  tab: TabItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      aria-current={active ? "page" : undefined}
      className={`h-auto min-h-11 w-full flex-col items-center gap-1 px-1 py-1 text-[10px] font-bold ${active ? "text-accent" : "text-muted"}`}
      onPress={onClick}
      type="button"
    >
      <Icon className="h-5 w-5" name={tab.icon} strokeWidth={active ? 2.3 : 1.8} />
      {tab.label}
    </Button>
  );
}

function TransactionSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  return (
    <ModalDialog labelledBy="transaction-title" onClose={onClose}>
      <Card className="block gap-0 w-full max-w-md rounded-2xl bg-surface p-4 sm:rounded-[1.8rem] sm:p-5">
        <div className="flex items-start justify-between">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-secondary text-xl sm:h-14 sm:w-14 sm:rounded-2xl sm:text-2xl">
            {transaction.emoji}
          </span>
          <Button
            isIconOnly
            variant="ghost"
            aria-label="Close transaction details"
            className="grid h-11 w-11 place-items-center rounded-full border border-border text-muted"
            onPress={onClose}
            type="button"
          >
            <Icon name="close" />
          </Button>
        </div>
        <h2
          className="mt-3 text-xl font-black tracking-[-0.04em] text-foreground sm:mt-5 sm:text-2xl"
          id="transaction-title"
        >
          {transaction.merchant ?? "Merchant or source missing"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {transaction.category ?? "Category not assigned"} ·{" "}
          {transaction.method ?? "Account not assigned"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {transaction.kind ? typeNames[transaction.kind] : "Type missing"}
          {transaction.date ? ` · ${formatDay(transaction.date)}` : ""}
          {transaction.time ? `, ${transaction.time}` : ""}
        </p>
        <p className="mt-4 break-words text-3xl font-black tracking-[-0.055em] text-foreground sm:mt-6 sm:text-4xl">
          {transaction.amount === null ? "Amount missing" : formatRupiah(transaction.amount)}
        </p>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-secondary px-3 py-2 text-sm sm:mt-6 sm:rounded-2xl sm:px-4 sm:py-3">
          <span className="text-muted">AI confidence</span>
          <span className="font-bold text-accent">
            {transaction.confidence === null ? "Not applicable" : `${transaction.confidence}%`}
          </span>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-accent sm:mt-5">
          <Icon name="check" /> Confirmed
        </p>
      </Card>
    </ModalDialog>
  );
}

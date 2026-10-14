"use client";

import { Alert, Button } from "@monara/ui";

import Link from "next/link";

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppSessionContext } from "@/components/app-session-context";
import { Icon, type IconName } from "@/components/icon";
import { Logo } from "@/components/logo";
import { ModalDialog } from "@/components/modal-dialog";
import { TransactionDetails } from "@/components/transaction-details";
import { type TransactionDraft, TransactionEditor } from "@/components/transaction-editor";
import { useAppNavigation } from "@/components/use-app-navigation";
import type { AppScreen } from "@/data/app-navigation";
import {
  deleteConfirmedTransaction,
  demoMonth,
  demoReminders,
  demoToday,
  type Reminder,
  rejectPendingTransaction,
  type TransactionValues,
  transactionErrors,
  undoTransactionDeletion,
  undoTransactionUpdate,
  updateConfirmedTransaction,
  updatePendingTransaction,
} from "@/data/demo-ledger";
import { budgets, initialBills, initialTransactions, type Transaction } from "@/data/sample-data";
import type { AuthenticatedProfile } from "@/lib/auth/identity";

type Tab = AppScreen;
type TabItem = { id: Tab; label: string; icon: IconName };

const tabs: TabItem[] = [
  { id: "home", label: "Overview", icon: "home" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "budgets", label: "Budgets", icon: "budgets" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "account", label: "Profile", icon: "account" },
];

const mobileTabs: TabItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "budgets", label: "Budgets", icon: "budgets" },
  { id: "chat", label: "Chat", icon: "chat" },
];

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
          <ul className="mt-2 divide-y divide-separator">
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
  hrefFor,
  reminderCount,
  onOpenReminders,
  onAdd,
}: {
  activeTab: Tab;
  hrefFor: (tab: Tab) => string;
  reminderCount: number;
  onOpenReminders: () => void;
  onAdd: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface p-5 lg:flex lg:flex-col">
      <Logo />
      <nav aria-label="Main navigation" className="mt-8 space-y-1">
        {tabs.map((tab) => (
          <Link
            href={hrefFor(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`flex min-h-11 w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              activeTab === tab.id
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
            key={tab.id}
          >
            <Icon name={tab.icon} /> {tab.label}
          </Link>
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
      <div className="mt-auto flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-3">
        <span className="min-w-0 text-xs text-warning-soft-foreground">
          <strong className="block text-sm">Sample data</strong>
          Resets when you reload
        </span>
      </div>
      <Button className="mt-3 min-h-12 w-full gap-2 rounded-full" onPress={onAdd}>
        <Icon name="plus" />
        Add transaction
      </Button>
    </aside>
  );
}

function MobileHeader({
  activeTab,
  reminderCount,
  onOpenReminders,
  onOpenProfile,
  onOpenReports,
}: {
  activeTab: Tab;
  reminderCount: number;
  onOpenReminders: () => void;
  onOpenProfile: () => void;
  onOpenReports: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center justify-between border-b border-border bg-background pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(.5rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)] sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] lg:hidden">
      <Logo />
      <div className="flex items-center">
        <Button
          aria-label="Open Reports"
          aria-current={activeTab === "reports" ? "page" : undefined}
          className="rounded-full text-foreground"
          isIconOnly
          onPress={onOpenReports}
          variant="ghost"
        >
          <Icon name="reports" />
        </Button>
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
  hrefFor,
  onAdd,
}: {
  activeTab: Tab;
  hrefFor: (tab: Tab) => string;
  onAdd: () => void;
}) {
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pl-[max(.5rem,env(safe-area-inset-left,0px))] pr-[max(.5rem,env(safe-area-inset-right,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-1.5 lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {mobileTabs.map((tab) => (
          <MobileTab active={activeTab === tab.id} key={tab.id} href={hrefFor(tab.id)} tab={tab} />
        ))}
        <Button
          aria-label="Add transaction"
          className="h-12 min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] leading-[15px] font-bold text-muted"
          onPress={onAdd}
          type="button"
          variant="ghost"
        >
          <Icon className="h-5 w-5" name="plus" strokeWidth={1.8} />
          Add
        </Button>
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

type SaveNotice = {
  message: string;
  undo?:
    | { kind: "update"; before: Transaction; expected: Transaction }
    | { kind: "delete"; transaction: Transaction; index: number };
};

function SessionNotice({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: SaveNotice | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2">
      <p className="min-w-0 flex-1 text-sm font-semibold" role="status">
        {notice.message}
      </p>
      {notice.undo ? (
        <Button className="rounded-full text-accent" onPress={onUndo} size="sm" variant="ghost">
          Undo
        </Button>
      ) : null}
      <Button
        aria-label="Dismiss message"
        className="rounded-full"
        isIconOnly
        onPress={onDismiss}
        variant="ghost"
      >
        <Icon name="close" />
      </Button>
    </div>
  );
}

function MissingTransaction({ onClose }: { onClose: () => void }) {
  return (
    <ModalDialog labelledBy="missing-transaction" onClose={onClose}>
      <div className="p-5">
        <h2 id="missing-transaction" className="text-xl font-bold">
          Transaction unavailable
        </h2>
        <p className="mt-2 text-sm text-muted">Sample changes reset on reload.</p>
        <Button className="mt-4 w-full" onPress={onClose}>
          Close
        </Button>
      </div>
    </ModalDialog>
  );
}

function draftForMonth(month: string): TransactionDraft {
  return {
    merchant: "",
    amount: "",
    date: month === demoMonth ? demoToday : `${month}-01`,
    time: "",
    kind: "expense",
    currency: "IDR",
    category: null,
    method: null,
  };
}

export function MonaraApp({
  children,
  profile,
}: {
  children: ReactNode;
  profile: AuthenticatedProfile;
}) {
  const navigation = useAppNavigation();
  const { view } = navigation;
  const [transactions, setTransactions] = useState(initialTransactions);
  const [bills, setBills] = useState(initialBills);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TransactionDraft>>({});
  const mainRef = useRef<HTMLElement>(null);
  const online = useOnlineStatus();
  const reminders = demoReminders(transactions, budgets, bills);
  const selected = transactions.find(
    (item) => item.id === view.transactionId && item.status !== "rejected",
  );
  const editing = transactions.find(
    (item) => item.id === view.editId && item.status !== "rejected",
  );
  const rejecting = transactions.find(
    (item) => item.id === view.rejectId && item.status === "pending",
  );
  const editorKey = view.editId ?? `new:${view.month}`;

  useEffect(() => {
    const title = tabs.find((tab) => tab.id === view.screen)?.label ?? "Monara";
    mainRef.current?.setAttribute("aria-label", title);
    mainRef.current?.focus({ preventScroll: true });
  }, [view.screen]);

  const openReview = () =>
    navigation.navigate({
      screen: "transactions",
      reviewOpen: true,
      kindFilter: "all",
      transactionId: null,
      editId: null,
      adding: false,
    });
  const confirm = (id: string) => {
    const item = transactions.find(
      (transaction) => transaction.id === id && transaction.status === "pending",
    );
    if (!item) return;
    if (Object.keys(transactionErrors(item)).length > 0) {
      navigation.openEdit(id);
      return;
    }
    setTransactions((items) => updatePendingTransaction(items, id, item, "confirm"));
    setNotice({ message: "Transaction confirmed." });
    if (view.transactionId) navigation.closePopup();
  };

  const save = async (values: TransactionValues, action: "edit" | "confirm" | "correct") => {
    if (!editing) throw new Error("This transaction is unavailable.");
    if (action !== "edit" && Object.keys(transactionErrors(values)).length > 0)
      throw new Error("Check the transaction details.");
    const next =
      action === "correct"
        ? updateConfirmedTransaction(transactions, editing.id, values)
        : updatePendingTransaction(transactions, editing.id, values, action);
    if (next === transactions)
      throw new Error("This transaction changed. Reopen it and try again.");
    const expected = next.find((item) => item.id === editing.id);
    setTransactions(next);
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    if (action === "correct" && expected)
      setNotice({
        message: "Transaction updated.",
        undo: { kind: "update", before: editing, expected },
      });
    else
      setNotice({
        message:
          action === "confirm" ? "Transaction confirmed." : "Changes saved. Still pending review.",
      });
    navigation.navigate({ editId: null, transactionId: editing.id, adding: false }, "replace");
  };

  const add = async (values: TransactionValues) => {
    if (Object.keys(transactionErrors(values)).length > 0 || !values.merchant || !values.method)
      throw new Error("Check the transaction details.");
    const record: Transaction = {
      ...values,
      id: crypto.randomUUID(),
      emoji: "✦",
      confidence: null,
      status: "confirmed",
    };
    setTransactions((items) => [record, ...items]);
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    setNotice({ message: "Transaction added." });
    navigation.navigate({ adding: false, transactionId: record.id }, "replace");
  };

  const undo = () => {
    if (!notice?.undo) return;
    const restored =
      notice.undo.kind === "delete"
        ? undoTransactionDeletion(transactions, notice.undo.transaction, notice.undo.index)
        : undoTransactionUpdate(transactions, notice.undo.before, notice.undo.expected);
    if (restored === transactions) {
      setNotice({ message: "This transaction changed. Undo is unavailable." });
      return;
    }
    setTransactions(restored);
    setNotice({ message: "Change undone." });
  };

  const deleteTransaction = async (transaction: Transaction) => {
    const next = deleteConfirmedTransaction(transactions, transaction);
    if (next === transactions)
      throw new Error("This transaction changed. Reopen it and try again.");
    setTransactions(next);
    setNotice({
      message: "Transaction deleted.",
      undo: { kind: "delete", transaction, index: transactions.indexOf(transaction) },
    });
    setDrafts((items) => {
      const next = { ...items };
      delete next[transaction.id];
      return next;
    });
    navigation.navigate({ transactionId: null }, "replace");
  };

  const confirmBill = (id: string) => {
    setBills((items) =>
      items.map((bill) => (bill.id === id ? { ...bill, status: "active" } : bill)),
    );
    setNotice({ message: "Bill tracked." });
  };
  const dismissBill = (id: string) => {
    setBills((items) => items.filter((bill) => bill.id !== id));
    setNotice({ message: "Suggestion dismissed." });
  };
  const closeEditor = () => {
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    navigation.closePopup();
  };
  const missing = [
    { id: view.editId, transaction: editing },
    { id: view.transactionId, transaction: selected },
    { id: view.rejectId, transaction: rejecting },
  ].some(({ id, transaction }) => id !== null && !transaction);

  return (
    <AppSessionContext
      value={{
        profile,
        navigation,
        transactions,
        bills,
        reminders,
        online,
        query,
        setQuery,
        confirm,
        reject: navigation.openReject,
        confirmBill,
        dismissBill,
        openReview,
        openReminders: navigation.openReminders,
      }}
    >
      <div className="min-h-dvh bg-background text-foreground">
        <a
          className="fixed top-2 left-2 z-50 -translate-y-24 rounded-xl bg-accent px-4 py-3 font-semibold text-white focus:translate-y-0"
          href="#main-content"
        >
          Skip to content
        </a>
        <div className="mx-auto min-h-dvh max-w-[1760px] bg-background lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
          <DesktopSidebar
            activeTab={view.screen}
            hrefFor={navigation.hrefFor}
            onAdd={navigation.openAdd}
            onOpenReminders={navigation.openReminders}
            reminderCount={reminders.length}
          />
          <div className="min-w-0">
            <MobileHeader
              activeTab={view.screen}
              reminderCount={reminders.length}
              onOpenProfile={() => navigation.navigate({ screen: "account" })}
              onOpenReports={() => navigation.navigate({ screen: "reports" })}
              onOpenReminders={navigation.openReminders}
            />
            {!online ? (
              <Alert className="rounded-none px-4 py-2" role="status" status="warning">
                <Alert.Content>
                  <Alert.Title className="text-center text-xs">
                    Offline. Reconnect for sign-in and sync.
                  </Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}
            <main
              ref={mainRef}
              id="main-content"
              tabIndex={-1}
              className="mx-auto w-full max-w-[1280px] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3 outline-none sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] lg:px-8 lg:pb-16 xl:px-10"
            >
              <p className="mb-2 text-[11px] text-muted lg:hidden">
                Sample data · resets when you reload
              </p>
              <SessionNotice notice={notice} onUndo={undo} onDismiss={() => setNotice(null)} />
              <div className={notice ? "mt-4" : ""}>{children}</div>
            </main>
          </div>
        </div>
        <BottomNav
          activeTab={view.screen}
          onAdd={navigation.openAdd}
          hrefFor={navigation.hrefFor}
        />
        {selected ? (
          <TransactionDetails
            key={selected.id}
            transaction={selected}
            onClose={navigation.closePopup}
            onEdit={() => navigation.openEdit(selected.id)}
            onConfirm={() => confirm(selected.id)}
            onDelete={() => deleteTransaction(selected)}
          />
        ) : null}
        {editing ? (
          <TransactionEditor
            key={editing.id}
            transaction={editing}
            initialDraft={drafts[editorKey]}
            onDraftChange={(draft) => setDrafts((items) => ({ ...items, [editorKey]: draft }))}
            onClose={closeEditor}
            onSave={save}
          />
        ) : null}
        {view.adding ? (
          <TransactionEditor
            key={editorKey}
            initialDraft={drafts[editorKey] ?? draftForMonth(view.month)}
            pristineDraft={draftForMonth(view.month)}
            onDraftChange={(draft) => setDrafts((items) => ({ ...items, [editorKey]: draft }))}
            onClose={closeEditor}
            onSave={add}
          />
        ) : null}
        {missing ? <MissingTransaction onClose={navigation.closePopup} /> : null}
        {rejecting ? (
          <RejectDialog
            transaction={rejecting}
            onCancel={navigation.closePopup}
            onReject={() => {
              setTransactions((items) => rejectPendingTransaction(items, rejecting.id));
              navigation.closePopup();
              setNotice({ message: "Transaction rejected." });
            }}
          />
        ) : null}
        {view.remindersOpen ? (
          <RemindersSheet onClose={navigation.closePopup} reminders={reminders} />
        ) : null}
      </div>
    </AppSessionContext>
  );
}

function MobileTab({ tab, active, href }: { tab: TabItem; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] leading-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${active ? "text-accent" : "text-muted"}`}
    >
      <Icon className="h-5 w-5" name={tab.icon} strokeWidth={active ? 2.3 : 1.8} />
      {tab.label}
    </Link>
  );
}

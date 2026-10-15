"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppSession } from "@/components/app-session-context";
import { useTransactionActions } from "@/components/transaction-actions";
import type { TransactionDraft } from "@/components/transaction-editor";
import { useAppNavigation } from "@/components/use-app-navigation";
import { useFinanceSync } from "@/components/use-finance-sync";
import { replayTour, useTourPending } from "@/components/use-product-tour";
import type { AppView } from "@/data/app-navigation";
import type { Budget, Reminder } from "@/data/demo-ledger";
import { demoReminders, demoToday, type RecurringBill } from "@/data/demo-ledger";
import {
  demoAttentionBudgets,
  financialAttention,
  mergeNotificationRecords,
  notificationUpdatesCount,
} from "@/data/financial-attention";
import {
  duePersonalReminders,
  type PersonalReminder,
  personalReminderErrors,
} from "@/data/personal-reminders";
import {
  initialBills,
  budgets as initialBudgets,
  initialTransactions,
  type Transaction,
} from "@/data/sample-data";
import type { AuthenticatedProfile } from "@/lib/auth/identity";
import type { FinanceSnapshot } from "@/lib/finance/presentation";

export type SaveNotice = {
  message: string;
  undo?:
    | { kind: "update"; before: Transaction; expected: Transaction }
    | { kind: "delete"; transaction: Transaction; index: number };
};

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const amountsKey = "monara.hide-amounts";
const preferenceEvent = "monara-preferences";
let memoryAmountsHidden = false;

function subscribeToPreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(preferenceEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(preferenceEvent, callback);
  };
}

// A display preference only; no financial value is stored on the device.
function useAmountsHidden(): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    subscribeToPreferences,
    () => {
      try {
        return window.localStorage.getItem(amountsKey) === "1";
      } catch {
        return memoryAmountsHidden;
      }
    },
    () => false,
  );
  const toggle = () => {
    memoryAmountsHidden = !hidden;
    try {
      window.localStorage.setItem(amountsKey, hidden ? "0" : "1");
    } catch {
      // Storage can be unavailable in private modes; the toggle then lasts until reload.
    }
    window.dispatchEvent(new Event(preferenceEvent));
  };
  return [hidden, toggle];
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,
  );
}

function homeIsUncovered(view: AppView) {
  return (
    view.screen === "home" &&
    !view.adding &&
    !view.editId &&
    !view.transactionId &&
    !view.rejectId &&
    !view.remindersOpen
  );
}

function sessionRecords(
  snapshot: FinanceSnapshot | undefined,
  demoTransactions: Transaction[],
  bills: RecurringBill[],
  budgets: Budget[],
) {
  if (snapshot)
    return {
      transactions: snapshot.transactions,
      selectedBudgets: snapshot.budgets,
      reminders: snapshot.reminders,
      resources: { financialAccounts: snapshot.financialAccounts, categories: snapshot.categories },
    };
  return {
    transactions: demoTransactions,
    selectedBudgets: budgets,
    reminders: demoReminders(demoTransactions, budgets, bills),
    resources: undefined,
  };
}

function selectionFor(transactions: Transaction[], view: AppView, removedId: string | null) {
  const selected = transactions.find(
    (item) => item.id === view.transactionId && item.status !== "rejected",
  );
  const editing = transactions.find(
    (item) => item.id === view.editId && item.status !== "rejected",
  );
  const rejecting = transactions.find(
    (item) => item.id === view.rejectId && item.status === "pending",
  );
  const missing = [
    { id: view.editId, transaction: editing },
    { id: view.transactionId, transaction: selected },
    { id: view.rejectId, transaction: rejecting },
  ].some(({ id, transaction }) => id !== null && id !== removedId && !transaction);
  return { selected, editing, rejecting, missing };
}

export function useMonaraSession(profile: AuthenticatedProfile, initialFinance?: FinanceSnapshot) {
  const today = initialFinance?.today ?? demoToday;
  const currentMonth = today.slice(0, 7);
  const live = initialFinance !== undefined;
  const navigation = useAppNavigation(currentMonth);
  const { view } = navigation;
  const [demoTransactions, setTransactions] = useState(initialTransactions);
  const [demoBudgets, setBudgets] = useState(initialBudgets);
  const [personalReminders, setPersonalReminders] = useState<PersonalReminder[]>([]);
  const [notificationStatuses, setNotificationStatuses] = useState<
    Record<string, "read" | "dismissed">
  >({});
  const [attentionStatuses, setAttentionStatuses] = useState<Record<string, "read" | "dismissed">>(
    {},
  );
  const [knownReminders, setKnownReminders] = useState<Reminder[]>([]);
  const rememberNotificationRecords = useCallback((records: Reminder[]) => {
    setKnownReminders((previous) => mergeNotificationRecords(previous, records));
  }, []);
  const sync = useFinanceSync(initialFinance, view.month, today);
  const financeSnapshot = sync.snapshot;
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [bills, setBills] = useState(live ? [] : initialBills);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TransactionDraft>>({});
  const mainRef = useRef<HTMLElement>(null);
  const online = useOnlineStatus();
  const [amountsHidden, toggleAmounts] = useAmountsHidden();
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const tourMode: "live" | "demo" = live ? "live" : "demo";
  const tourPending = useTourPending(tourMode, homeIsUncovered(view));
  const {
    transactions,
    selectedBudgets,
    reminders: activeReminders,
    resources,
  } = sessionRecords(financeSnapshot, demoTransactions, bills, demoBudgets);
  const reminders = live
    ? activeReminders
    : activeReminders.map((reminder) => ({
        ...reminder,
        status: notificationStatuses[reminder.id] ?? ("unread" as const),
      }));
  const currentReminderRecords = mergeNotificationRecords(knownReminders, reminders);
  const attentionBudgets = financeSnapshot
    ? financeSnapshot.allBudgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
        category:
          financeSnapshot.categories.find((category) => category.id === budget.categoryId)?.name ??
          "Category unavailable",
        categoryId: budget.categoryId,
        cadence: budget.cadence,
        startsOn: budget.startsOn,
        limit: BigInt(budget.limit.amountMinor),
        warningPercent: budget.warningPercent,
        active: budget.isActive && budget.deletedAt === null,
      }))
    : demoAttentionBudgets(demoBudgets, today);
  const attentionNotifications = financialAttention({
    transactions,
    budgets: attentionBudgets,
    bills,
    reminders: currentReminderRecords,
    today,
    states: attentionStatuses,
  });
  const updatesCount = notificationUpdatesCount(
    currentReminderRecords,
    attentionNotifications,
    bills,
  );
  const { mutationPending } = sync;
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { selected, editing, rejecting, missing } = selectionFor(transactions, view, removedId);
  const editorKey = view.editId ?? `new:${view.month}`;

  const refreshFinance = sync.refresh;
  const mutate = sync.runMutation;

  useEffect(() => {
    const title = view.screen === "home" ? "Home" : view.screen;
    mainRef.current?.setAttribute("aria-label", title);
    mainRef.current?.focus({ preventScroll: true });
  }, [view.screen]);

  const openReview = () =>
    navigation.navigate({
      screen: "transactions",
      remindersOpen: false,
      reviewOpen: true,
      kindFilter: "all",
      transactionId: null,
      editId: null,
      adding: false,
    });
  const {
    confirm,
    save,
    add,
    undo,
    deleteTransaction,
    confirmBill,
    dismissBill,
    closeEditor,
    rejectSelected,
  } = useTransactionActions({
    live,
    resources,
    transactions,
    editing,
    rejecting,
    editorKey,
    mutate,
    navigation,
    notice,
    setNotice,
    setDrafts,
    setTransactions,
    setRemovedId,
    setBills,
    setConfirmError,
    setRejectError,
  });

  // Native history updates can settle after the ledger mutation. Suppress only the
  // current removal, then let later stale links show the normal unavailable state.
  if (removedId && ![view.editId, view.transactionId, view.rejectId].includes(removedId)) {
    setRemovedId(null);
  }

  const session: AppSession = {
    profile,
    navigation,
    transactions,
    budgets: selectedBudgets,
    today,
    currentMonth,
    dataMode: tourMode,
    financeSnapshot,
    refreshFinance,
    mutationPending,
    refreshRequired: sync.needsRecovery,
    runMutation: mutate,
    bills,
    reminders,
    attentionNotifications,
    updatesCount,
    rememberNotificationRecords,
    setAttentionNotificationStatus: (id, status) =>
      setAttentionStatuses((previous) => ({ ...previous, [id]: status })),
    reminderCount: updatesCount + duePersonalReminders(personalReminders, today),
    personalReminders,
    updateDemoBudget: (budgetId, changes) => {
      if (live) return;
      setBudgets((items) =>
        items.map((budget) => (budget.id === budgetId ? { ...budget, ...changes } : budget)),
      );
      setNotice({ message: "Budget updated for this demo visit." });
    },
    saveDemoReminder: (draft, id) => {
      if (live || Object.keys(personalReminderErrors(draft)).length > 0) return;
      const title = draft.title.trim();
      if (id)
        setPersonalReminders((items) =>
          items.map((reminder) =>
            reminder.id === id ? { ...reminder, ...draft, title } : reminder,
          ),
        );
      else
        setPersonalReminders((items) => [
          ...items,
          { ...draft, title, id: crypto.randomUUID(), completedAt: null },
        ]);
      setNotice({
        message: id
          ? "Reminder updated for this demo visit."
          : "Reminder added for this demo visit.",
      });
    },
    setDemoReminderDone: (id, done) => {
      if (live) return;
      setPersonalReminders((items) =>
        items.map((reminder) =>
          reminder.id === id
            ? { ...reminder, completedAt: done ? new Date().toISOString() : null }
            : reminder,
        ),
      );
    },
    setDemoNotificationStatus: (id, status) => {
      if (live) return;
      setNotificationStatuses((previous) => ({ ...previous, [id]: status }));
    },
    online,
    query,
    setQuery,
    confirm,
    reject: navigation.openReject,
    confirmBill,
    dismissBill,
    openReview,
    openReminders: navigation.openReminders,
    openChat: (prompt) => {
      setChatPrompt(prompt ?? null);
      navigation.navigate({ screen: "chat" });
    },
    chatPrompt,
    clearChatPrompt: () => setChatPrompt(null),
    amountsHidden,
    toggleAmounts,
    logDemoPayment: (merchant, amount) => {
      if (live) return;
      setTransactions((items) => [
        {
          id: crypto.randomUUID(),
          merchant,
          category: null,
          amount,
          currency: "IDR",
          date: today,
          time: null,
          method: "Cash",
          kind: "expense",
          emoji: "✦",
          confidence: null,
          status: "confirmed",
        },
        ...items,
      ]);
    },
    replayTour: () => {
      replayTour(tourMode);
      navigation.navigate({ screen: "home" });
    },
  };
  return {
    session,
    live,
    view,
    mainRef,
    notice,
    setNotice,
    undo,
    selected,
    editing,
    rejecting,
    drafts,
    setDrafts,
    editorKey,
    closeEditor,
    save,
    add,
    deleteTransaction,
    mutationPending,
    confirmError,
    rejectError,
    missing,
    tourPending,
    tourMode,
    rejectSelected,
    resources,
    sync,
  };
}

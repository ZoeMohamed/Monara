"use client";

import type { Category, CreateFinancialAccountInput, FinancialAccount } from "@monara/contracts";
import { createContext, useContext } from "react";
import type { DemoBudgetChanges } from "@/components/demo-budget-editor";
import type { AppNavigation } from "@/components/use-app-navigation";
import type { MutationOptions } from "@/components/use-finance-sync";
import { amountDisplay } from "@/data/amount-display";
import type { Budget, RecurringBill, Reminder, Transaction } from "@/data/demo-ledger";
import type { FinancialAttention } from "@/data/financial-attention";
import type { PersonalReminder, PersonalReminderDraft } from "@/data/personal-reminders";
import type { AuthenticatedProfile } from "@/lib/auth/identity";
import type { FinanceSnapshot } from "@/lib/finance/presentation";

export type AppSession = {
  profile: AuthenticatedProfile;
  navigation: AppNavigation;
  transactions: Transaction[];
  budgets: Budget[];
  financialAccounts: FinancialAccount[];
  categories: Category[];
  createDemoCategory: (input: { name: string; icon: string }) => void;
  updateDemoCategory: (original: string, changes: { name: string; icon: string }) => void;
  archiveDemoCategory: (name: string) => void;
  createDemoAccount: (input: Omit<CreateFinancialAccountInput, "clientRequestId">) => void;
  updateDemoAccount: (
    accountId: string,
    changes: Partial<Pick<FinancialAccount, "name" | "institution" | "accountType" | "isActive">>,
  ) => void;
  createDemoBudget: (input: {
    category: string;
    icon: string | null;
    limit: number;
    startsOn: string;
    warningPercent: number;
    cadence: "monthly" | "weekly";
  }) => void;
  today: string;
  currentMonth: string;
  dataMode: "live" | "demo";
  financeSnapshot?: FinanceSnapshot;
  refreshFinance: () => Promise<void>;
  mutationPending: boolean;
  refreshRequired: boolean;
  runMutation: <Result>(
    operation: () => Promise<Result>,
    options?: MutationOptions<Result>,
  ) => Promise<Result>;
  bills: RecurringBill[];
  reminders: Reminder[];
  attentionNotifications: FinancialAttention[];
  updatesCount: number;
  setAttentionNotificationStatus: (id: string, status: "read" | "dismissed") => void;
  rememberNotificationRecords: (reminders: Reminder[]) => void;
  reminderCount: number;
  personalReminders: PersonalReminder[];
  updateDemoBudget: (budgetId: string, changes: DemoBudgetChanges) => void;
  saveDemoReminder: (draft: PersonalReminderDraft, id?: string) => void;
  setDemoReminderDone: (id: string, done: boolean) => void;
  setDemoNotificationStatus: (id: string, status: "read" | "dismissed") => void;
  online: boolean;
  query: string;
  setQuery: (query: string) => void;
  confirm: (id: string) => Promise<void>;
  reject: (id: string) => void;
  confirmBill: (id: string) => void;
  dismissBill: (id: string) => void;
  openReview: () => void;
  openReminders: () => void;
  /** Opens chat, optionally with a suggested prompt ready to send. */
  openChat: (prompt?: string) => void;
  chatPrompt: string | null;
  clearChatPrompt: () => void;
  amountsHidden: boolean;
  toggleAmounts: () => void;
  replayTour: () => void;
  /** Demo only: records a confirmed cash expense in browser memory. */
  logDemoPayment: (merchant: string, amount: number) => void;
};

export const AppSessionContext = createContext<AppSession | null>(null);

/** Standalone previews show amounts; app screens share the existing privacy preference. */
export function useAmountDisplay() {
  const session = useContext(AppSessionContext);
  return amountDisplay(session?.amountsHidden ?? false);
}

export function useAppSession(): AppSession {
  const session = useContext(AppSessionContext);
  if (!session) throw new Error("Monara screens require the shared app layout.");
  return session;
}

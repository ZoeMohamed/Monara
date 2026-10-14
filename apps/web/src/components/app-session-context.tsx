"use client";

import { createContext, useContext } from "react";

import type { AppNavigation } from "@/components/use-app-navigation";
import type { RecurringBill, Reminder, Transaction } from "@/data/demo-ledger";

import type { AuthenticatedProfile } from "@/lib/auth/identity";

export type AppSession = {
  profile: AuthenticatedProfile;
  navigation: AppNavigation;
  transactions: Transaction[];
  bills: RecurringBill[];
  reminders: Reminder[];
  online: boolean;
  query: string;
  setQuery: (query: string) => void;
  confirm: (id: string) => void;
  reject: (id: string) => void;
  confirmBill: (id: string) => void;
  dismissBill: (id: string) => void;
  openReview: () => void;
  openReminders: () => void;
};

export const AppSessionContext = createContext<AppSession | null>(null);

export function useAppSession(): AppSession {
  const session = useContext(AppSessionContext);
  if (!session) throw new Error("Monara screens require the shared app layout.");
  return session;
}

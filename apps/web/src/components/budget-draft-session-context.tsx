"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { protectUnsavedChanges } from "@/lib/auth/local-user-state";
import type { BudgetDraftSession } from "@/lib/finance/budget-session";

type BudgetDraftSessions = {
  sessions: Record<string, BudgetDraftSession>;
  keep: (key: string, session: BudgetDraftSession) => void;
  forget: (key: string) => void;
};
const BudgetDraftSessionContext = createContext<BudgetDraftSessions | null>(null);

/** Lives with the signed-in app shell, never in browser storage or the service worker. */
export function BudgetDraftSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, BudgetDraftSession>>({});
  const keep = useCallback((key: string, session: BudgetDraftSession) => {
    setSessions((previous) => ({ ...previous, [key]: session }));
  }, []);
  const forget = useCallback((key: string) => {
    setSessions((previous) => {
      if (!(key in previous)) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, []);
  const hasDrafts = Object.keys(sessions).length > 0;
  useEffect(() => {
    if (!hasDrafts) return;
    const protectDrafts = (event: BeforeUnloadEvent) => protectUnsavedChanges(event);
    window.addEventListener("beforeunload", protectDrafts);
    return () => window.removeEventListener("beforeunload", protectDrafts);
  }, [hasDrafts]);
  const value = useMemo(() => ({ sessions, keep, forget }), [sessions, keep, forget]);
  return <BudgetDraftSessionContext value={value}>{children}</BudgetDraftSessionContext>;
}

export function useBudgetDraftSessions() {
  const context = useContext(BudgetDraftSessionContext);
  if (!context) throw new Error("Budget drafts require the shared app session.");
  return context;
}

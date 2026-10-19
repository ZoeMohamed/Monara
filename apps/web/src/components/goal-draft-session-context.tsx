"use client";

import type { FinancialGoal } from "@monara/contracts";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { protectUnsavedChanges } from "@/lib/auth/local-user-state";
import { type GoalDraftSession, isGoalDraftDirty } from "@/lib/goals/draft";

type GoalSessions = {
  sessions: Record<string, GoalDraftSession>;
  get: (key: string) => GoalDraftSession | undefined;
  keep: (key: string, session: GoalDraftSession) => void;
  forget: (key: string) => void;
  claim: (key: string) => boolean;
  release: (key: string) => void;
  demoGoals: FinancialGoal[] | null;
  setDemoGoals: Dispatch<SetStateAction<FinancialGoal[] | null>>;
  localImages: Record<string, string>;
  setLocalImages: Dispatch<SetStateAction<Record<string, string>>>;
  notice: string | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
};
const GoalDraftContext = createContext<GoalSessions | null>(null);

/** Goal drafts, retry identities and photos live only with this User's in-memory app shell. */
export function GoalDraftSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, GoalDraftSession>>({});
  const latest = useRef(sessions);
  const busy = useRef(new Set<string>());
  const [demoGoals, setDemoGoals] = useState<FinancialGoal[] | null>(null);
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const get = useCallback((key: string) => latest.current[key], []);
  const keep = useCallback((key: string, session: GoalDraftSession) => {
    latest.current = { ...latest.current, [key]: session };
    setSessions(latest.current);
  }, []);
  const forget = useCallback((key: string) => {
    const next = { ...latest.current };
    delete next[key];
    latest.current = next;
    setSessions(next);
  }, []);
  const claim = useCallback((key: string) => {
    if (busy.current.has(key) || latest.current[key]?.pending) return false;
    busy.current.add(key);
    return true;
  }, []);
  const release = useCallback((key: string) => {
    busy.current.delete(key);
  }, []);
  const hasDrafts = Object.values(sessions).some(
    (session) =>
      isGoalDraftDirty(session) ||
      session.pending ||
      session.uncertain ||
      session.savedGoal !== null,
  );
  useEffect(() => {
    if (!hasDrafts) return;
    const protectDraft = (event: BeforeUnloadEvent) => protectUnsavedChanges(event);
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasDrafts]);
  const value = useMemo(
    () => ({
      sessions,
      get,
      keep,
      forget,
      claim,
      release,
      demoGoals,
      setDemoGoals,
      localImages,
      setLocalImages,
      notice,
      setNotice,
    }),
    [sessions, get, keep, forget, claim, release, demoGoals, localImages, notice],
  );
  return <GoalDraftContext value={value}>{children}</GoalDraftContext>;
}

export function useGoalDraftSessions() {
  const sessions = useContext(GoalDraftContext);
  if (!sessions) throw new Error("Goal drafts require the shared app session.");
  return sessions;
}

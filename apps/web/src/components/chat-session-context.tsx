"use client";

import type { ChatHistorySaveStatus } from "@monara/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChatHistory } from "@/components/use-chat-history";
import { protectUnsavedChanges } from "@/lib/auth/local-user-state";
import {
  type ChatSessionAction,
  type ChatSessionState,
  initialChatSession,
  reduceChatSession,
} from "@/lib/chat/session";

type ChatSession = {
  state: ChatSessionState;
  pending: boolean;
  dispatch: (action: ChatSessionAction) => void;
  beginSend: () => boolean;
  endSend: () => void;
  rememberSave: (status: ChatHistorySaveStatus) => void;
  history: {
    persistent: boolean;
    loading: boolean;
    saving: boolean;
    error: string | null;
    notice: string | null;
    dismissNotice: () => void;
    retry: () => void;
  };
};

const ChatSessionContext = createContext<ChatSession | null>(null);

/** Saved chats use the backend's private store; drafts and recovery receipts stay in memory. */
export function ChatSessionProvider({
  children,
  persistent = false,
}: {
  children: ReactNode;
  persistent?: boolean;
}) {
  const [state, setState] = useState(initialChatSession);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const dispatch = useCallback(
    (action: ChatSessionAction) => setState((current) => reduceChatSession(current, action)),
    [],
  );
  const { loading, saving, error, notice, dismissNotice, retry, remember, unsaved } =
    useChatHistory(persistent);
  const hasUnsentWork =
    pending ||
    unsaved ||
    state.conversations.some((conversation) => conversation.draft.trim() || conversation.receipt);
  useEffect(() => {
    if (!hasUnsentWork) return;
    const protectDraft = (event: BeforeUnloadEvent) => protectUnsavedChanges(event);
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsentWork]);
  const beginSend = useCallback(() => {
    if (sending.current) return false;
    sending.current = true;
    setPending(true);
    return true;
  }, []);
  const endSend = useCallback(() => {
    sending.current = false;
    setPending(false);
  }, []);
  const historyStatus = useMemo(
    () => ({ persistent, loading, saving, error, notice, dismissNotice, retry }),
    [persistent, loading, saving, error, notice, dismissNotice, retry],
  );
  const value = useMemo(
    () => ({
      state,
      pending,
      dispatch,
      beginSend,
      endSend,
      rememberSave: remember,
      history: historyStatus,
    }),
    [state, pending, dispatch, beginSend, endSend, remember, historyStatus],
  );
  return <ChatSessionContext value={value}>{children}</ChatSessionContext>;
}

export function useChatSession() {
  const session = useContext(ChatSessionContext);
  if (!session) throw new Error("Chat requires the Monara page session.");
  return session;
}

"use client";

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
};

const ChatSessionContext = createContext<ChatSession | null>(null);

/**
 * The working copy of the User's chats. Signed-in chats are saved by the server after each
 * answer and merged back in here; drafts and receipt photos stay in this page only.
 */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialChatSession);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const hasUnsentWork =
    pending ||
    state.conversations.some((conversation) => conversation.draft.trim() || conversation.receipt);
  useEffect(() => {
    if (!hasUnsentWork) return;
    const protectDraft = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsentWork]);
  const dispatch = useCallback(
    (action: ChatSessionAction) => setState((current) => reduceChatSession(current, action)),
    [],
  );
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
  const value = useMemo(
    () => ({ state, pending, dispatch, beginSend, endSend }),
    [state, pending, dispatch, beginSend, endSend],
  );
  return <ChatSessionContext value={value}>{children}</ChatSessionContext>;
}

export function useChatSession() {
  const session = useContext(ChatSessionContext);
  if (!session) throw new Error("Chat requires the Monara page session.");
  return session;
}

"use client";

import type { ChatHistorySaveStatus } from "@monara/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatHistorySaveQueue } from "@/lib/chat/history-save-queue";

const unsavedMessage =
  "Your reply is here, but hasn’t been saved to chat history yet. Keep this page open and save history again. This won’t repeat any money changes.";

/** Recover persistence separately from the Agent, keeping pending replies in page memory. */
export function useChatHistory(persistent: boolean) {
  const queue = useRef<ChatHistorySaveQueue | null>(null);
  if (queue.current === null) queue.current = new ChatHistorySaveQueue();
  const running = useRef(false);
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyRequired, setCopyRequired] = useState(false);

  const remember = useCallback(
    (status: ChatHistorySaveStatus) => {
      if (!persistent) return;
      queue.current?.remember(status);
      if (status.status === "pending") setNotice(null);
      else if (status.status === "unavailable") {
        setCopyRequired(true);
        setNotice("This reply couldn’t be saved. Copy it before leaving this page.");
      }
      setCount(queue.current?.count ?? 0);
      setError(queue.current?.count ? unsavedMessage : null);
    },
    [persistent],
  );

  const retry = useCallback(async () => {
    if (!persistent || running.current || !queue.current?.count) return;
    running.current = true;
    setSaving(true);
    try {
      await queue.current?.flush();
      // A reply may arrive at the final await boundary. Keep its warning and
      // unload protection until that exchange is acknowledged too.
      setError(queue.current?.count ? unsavedMessage : null);
      if (!queue.current?.count)
        setNotice("Chat history saved. Your money changes weren’t repeated.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? `${failure.message} Your reply stays on this page. Saving history won’t repeat any money changes.`
          : unsavedMessage,
      );
    } finally {
      running.current = false;
      setCount(queue.current?.count ?? 0);
      setSaving(false);
    }
  }, [persistent]);

  useEffect(() => {
    const retryOnline = () => void retry();
    window.addEventListener("online", retryOnline);
    return () => window.removeEventListener("online", retryOnline);
  }, [retry]);

  return {
    persistent,
    loading: false,
    saving,
    error,
    notice,
    dismissNotice: () => {
      setNotice(null);
      setCopyRequired(false);
    },
    retry: () => void retry(),
    remember,
    unsaved: count > 0 || copyRequired,
    copyRequired,
  };
}

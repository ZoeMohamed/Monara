"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  ACTIVE_USER_KEY,
  beginConfirmedSessionExit,
  clearExpiredAuthCookies,
  clearLocalUserState,
  isConfirmedSessionExiting,
  USER_DELETED_EVENT,
  USER_SESSION_EXIT_EVENT,
} from "@/lib/auth/local-user-state";

/** Discard old rendered records across tabs and after another device deletes the User. */
export function UserSessionGuard({
  setupKey,
  children,
}: {
  setupKey: string;
  children: ReactNode;
}) {
  const [exiting, setExiting] = useState(isConfirmedSessionExiting);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const hidePrivateState = () => {
      if (isConfirmedSessionExiting()) setExiting(true);
    };
    window.addEventListener(USER_SESSION_EXIT_EVENT, hidePrivateState);
    function leave(destination: string) {
      if (disposed) return;
      disposed = true;
      beginConfirmedSessionExit();
      try {
        clearLocalUserState(window.localStorage);
        clearLocalUserState(window.sessionStorage);
      } catch {
        /* Storage may be blocked. */
      }
      window.location.replace(destination);
    }
    try {
      const previous = window.localStorage.getItem(ACTIVE_USER_KEY);
      if (previous && previous !== setupKey) {
        clearLocalUserState(window.localStorage);
        window.localStorage.setItem(ACTIVE_USER_KEY, setupKey);
        beginConfirmedSessionExit();
        window.location.reload();
      } else window.localStorage.setItem(ACTIVE_USER_KEY, setupKey);
    } catch {
      /* Server checks still enforce identity isolation. */
    }
    function received(value: unknown) {
      if (
        typeof value === "object" &&
        value !== null &&
        "setupKey" in value &&
        value.setupKey === setupKey
      ) {
        // A browser event is a hint, never proof that the signed-in owner is invalid.
        void check("/account-deletion");
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== USER_DELETED_EVENT || !event.newValue) return;
      try {
        received(JSON.parse(event.newValue));
      } catch {
        /* Ignore unrelated malformed events. */
      }
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(USER_DELETED_EVENT);
      channel.onmessage = (event: MessageEvent<unknown>) => received(event.data);
    } catch {
      /* Storage events and session checks remain available. */
    }
    async function check(destination: "/account-deletion" | "/sign-in" = "/sign-in") {
      if (disposed || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/profile/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          typeof result === "object" &&
          result !== null &&
          "setupKey" in result &&
          (result.setupKey === null || typeof result.setupKey === "string") &&
          result.setupKey !== setupKey
        ) {
          if (result.setupKey === null) clearExpiredAuthCookies();
          leave(destination);
        }
      } catch {
        /* Do not treat an offline device as a deleted identity. */
      }
    }
    const checkStatus = () => void check();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", checkStatus);
    window.addEventListener("focus", checkStatus);
    window.addEventListener("online", checkStatus);
    document.addEventListener("visibilitychange", checkStatus);
    const interval = setInterval(() => void check(), 30_000);
    void check();
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(interval);
      channel?.close();
      window.removeEventListener(USER_SESSION_EXIT_EVENT, hidePrivateState);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", checkStatus);
      window.removeEventListener("focus", checkStatus);
      window.removeEventListener("online", checkStatus);
      document.removeEventListener("visibilitychange", checkStatus);
    };
  }, [setupKey]);
  return exiting ? (
    <main aria-busy="true" className="min-h-dvh bg-background p-6 text-muted">
      <p role="status">Closing this account’s private view…</p>
    </main>
  ) : (
    children
  );
}

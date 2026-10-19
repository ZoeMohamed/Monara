"use client";

import { useEffect } from "react";
import {
  ACTIVE_USER_KEY,
  clearExpiredAuthCookies,
  clearLocalUserState,
  USER_DELETED_EVENT,
} from "@/lib/auth/local-user-state";

/** Discard old rendered records across tabs and after another device deletes the User. */
export function UserSessionGuard({ setupKey }: { setupKey: string }) {
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    function leave(destination: string) {
      if (disposed) return;
      disposed = true;
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
        leave("/account-deletion");
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
    async function check() {
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
          result.setupKey !== setupKey
        ) {
          if (result.setupKey === null) clearExpiredAuthCookies();
          leave("/sign-in");
        }
      } catch {
        /* Do not treat an offline device as a deleted identity. */
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    const interval = setInterval(() => void check(), 30_000);
    void check();
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(interval);
      channel?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [setupKey]);
  return null;
}

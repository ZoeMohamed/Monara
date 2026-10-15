"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  type AppScreen,
  type AppView,
  buildAppHref,
  clearedView,
  parseAppView,
} from "@/data/app-navigation";

function returnHref(): string | null {
  const state: unknown = window.history.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>).monaraReturn;
  return typeof value === "string" ? value : null;
}

function hasPopup(view: AppView): boolean {
  return !!(
    view.adding ||
    view.editId ||
    view.transactionId ||
    view.rejectId ||
    view.remindersOpen
  );
}

const closedPopups = {
  adding: false,
  editId: null,
  transactionId: null,
  rejectId: null,
  remindersOpen: false,
};

export function useAppNavigation(defaultMonth?: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = parseAppView(pathname, searchParams, defaultMonth);
  const returnFocus = useRef<HTMLElement | null>(null);
  const popupOpen = hasPopup(view);

  useEffect(() => {
    if (popupOpen) return;
    // React Aria restores connected modal triggers first; replacements may have removed them.
    const frame = requestAnimationFrame(() => {
      const target = returnFocus.current;
      returnFocus.current = null;
      if (document.activeElement !== document.body) return;
      const fallback = document.getElementById("main-content");
      (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [popupOpen]);

  const navigate = (patch: Partial<AppView>, mode: "push" | "replace" = "push") => {
    const current = parseAppView(
      window.location.pathname,
      new URLSearchParams(window.location.search),
      defaultMonth,
    );
    const changingScreen = patch.screen && patch.screen !== current.screen;
    const next = { ...(changingScreen ? clearedView(current, patch.screen) : current), ...patch };
    const href = buildAppHref(next);
    if (href === `${window.location.pathname}${window.location.search}`) return;
    if (next.screen !== current.screen) {
      if (mode === "replace") router.replace(href);
      else router.push(href);
      return;
    }
    // Next copies its private history fields. Passing them here would bypass its URL update.
    const state: { monaraReturn?: string } = {};
    const previousReturn = returnHref();
    if (previousReturn) state.monaraReturn = previousReturn;
    const opensPopup = hasPopup(next);
    if (opensPopup && !hasPopup(current)) {
      state.monaraReturn = buildAppHref(clearedView(current));
      returnFocus.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
    }
    if (!opensPopup) delete state.monaraReturn;
    if (mode === "replace") window.history.replaceState(state, "", href);
    else window.history.pushState(state, "", href);
  };

  const closePopup = () => {
    const current = parseAppView(
      window.location.pathname,
      new URLSearchParams(window.location.search),
      defaultMonth,
    );
    if (returnHref() === buildAppHref(clearedView(current))) {
      window.history.back();
    } else {
      navigate(closedPopups, "replace");
    }
  };

  return {
    view,
    navigate,
    closePopup,
    hrefFor: (screen: AppScreen) => buildAppHref(clearedView(view, screen)),
    openTransaction: (id: string) =>
      navigate({ ...closedPopups, transactionId: id }, hasPopup(view) ? "replace" : "push"),
    openEdit: (id: string) =>
      navigate({ ...closedPopups, editId: id }, hasPopup(view) ? "replace" : "push"),
    openAdd: () => navigate({ ...closedPopups, adding: true }, hasPopup(view) ? "replace" : "push"),
    openReminders: () =>
      navigate({ ...closedPopups, remindersOpen: true }, hasPopup(view) ? "replace" : "push"),
    openReject: (id: string) =>
      navigate({ ...closedPopups, rejectId: id }, hasPopup(view) ? "replace" : "push"),
    // The demo has no account, so connecting a mailbox starts with sign-in.
    openGmail: () =>
      router.push(
        view.basePath === "/demo" ? "/sign-in?next=/connections/gmail" : "/connections/gmail",
      ),
    setMonth: (month: string) => navigate({ month }),
  };
}

export type AppNavigation = ReturnType<typeof useAppNavigation>;

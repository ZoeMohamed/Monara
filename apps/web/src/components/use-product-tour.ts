"use client";

import { useSyncExternalStore } from "react";

export type TourMode = "demo" | "live";

const tourEvent = "monara-tour";
const sessionSeen: Partial<Record<TourMode, boolean>> = {};

function storageKey(mode: TourMode) {
  return `monara.tour.v1.${mode}`;
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    for (const mode of ["demo", "live"] as const) {
      if (event.key === null || event.key === storageKey(mode)) delete sessionSeen[mode];
    }
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(tourEvent, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(tourEvent, callback);
  };
}

function readSeen(mode: TourMode): boolean {
  if (sessionSeen[mode] !== undefined) return sessionSeen[mode];
  try {
    return window.localStorage.getItem(storageKey(mode)) === "done";
  } catch {
    return false;
  }
}

export function writeTourSeen(mode: TourMode, seen: boolean) {
  sessionSeen[mode] = seen;
  try {
    if (seen) window.localStorage.setItem(storageKey(mode), "done");
    else window.localStorage.removeItem(storageKey(mode));
  } catch {
    // Blocked storage still allows dismissal and replay during this page view.
  }
  window.dispatchEvent(new Event(tourEvent));
}

/** Clears the "seen" flag so the tour runs again the next time Home is visible. */
export function replayTour(mode: TourMode) {
  writeTourSeen(mode, false);
}

/** Whether the first-run tour should run: on Home and not yet finished, at any width. */
export function useTourPending(mode: TourMode, onHome: boolean): boolean {
  const pending = useSyncExternalStore(
    subscribe,
    () => !readSeen(mode),
    () => false,
  );
  return pending && onHome;
}

"use client";

import { useSyncExternalStore } from "react";

import {
  migrateLegacyOnboardingPhase,
  type OnboardingPhase,
  parseOnboardingPhase,
} from "@/lib/onboarding/flow";

const changeEvent = "monara-onboarding";
const sessionPhase = new Map<string, OnboardingPhase>();

function storageKey(scope: string) {
  return `monara.onboarding.v2.${scope}`;
}

function legacyStorageKey(scope: string) {
  return `monara.onboarding.v1.${scope}`;
}

function subscribe(callback: () => void) {
  const onStorage = () => {
    sessionPhase.clear();
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, callback);
  };
}

function readPhase(scope: string): OnboardingPhase | null {
  const remembered = sessionPhase.get(scope);
  if (remembered) return remembered;
  try {
    const current = window.localStorage.getItem(storageKey(scope));
    if (current !== null) return parseOnboardingPhase(current);
    return migrateLegacyOnboardingPhase(
      parseOnboardingPhase(window.localStorage.getItem(legacyStorageKey(scope))),
    );
  } catch {
    return null;
  }
}

/** Where first-run setup stands in this browser; null until the User has started it. */
export function useStoredPhase(scope: string): OnboardingPhase | null {
  return useSyncExternalStore(
    subscribe,
    () => readPhase(scope),
    () => null,
  );
}

export function writeStoredPhase(scope: string, phase: OnboardingPhase) {
  sessionPhase.set(scope, phase);
  try {
    window.localStorage.setItem(storageKey(scope), phase);
  } catch {
    // Blocked storage still lets setup continue during this page view.
  }
  window.dispatchEvent(new Event(changeEvent));
}

"use client";

import { useCallback, useState } from "react";

import { useOnboarding } from "@/components/use-onboarding";
import { useTourPending } from "@/components/use-product-tour";

/**
 * Setup and the product tour share Home's first run. The demo has records to point at, so
 * its tour follows setup. Live Home starts empty, so its tour runs only when replayed.
 */
export function useFirstRun({
  live,
  email,
  setupKey,
  displayName,
  homeOpen,
  homeScreen,
  refreshFinance,
}: {
  live: boolean;
  email: string | null;
  setupKey?: string;
  displayName: string;
  homeOpen: boolean;
  homeScreen: boolean;
  refreshFinance: () => Promise<void>;
}) {
  const onboarding = useOnboarding({
    live,
    scope: live ? `live.${setupKey ?? email ?? "account"}` : "demo",
    onHome: homeOpen,
    onHomeScreen: homeScreen,
    // The demo guest has no real name to suggest.
    suggestedName: live ? displayName : "",
    refreshFinance,
  });
  const [replaying, setReplaying] = useState(false);
  const stored = useTourPending(live ? "live" : "demo", homeOpen);
  const afterSetup = onboarding.phase === "done" || onboarding.phase === "background";
  const tourPending = live ? replaying && homeOpen : stored && afterSetup;
  const startReplay = useCallback(() => setReplaying(true), []);
  const finishTour = useCallback(() => setReplaying(false), []);
  return { onboarding, tourPending, startReplay, finishTour };
}

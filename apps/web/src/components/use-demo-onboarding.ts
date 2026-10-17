"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  Detection,
  ImportProgress,
  OnboardingEngine,
} from "@/components/use-onboarding-engine";
import { waitingProgress } from "@/components/use-onboarding-engine";
import { demoImportFeed } from "@/data/demo-import-feed";
import { choiceFromSuggestion } from "@/lib/onboarding/banks";
import type { OnboardingPhase } from "@/lib/onboarding/flow";

const sampleBanks = [
  {
    institutionKey: "BCA_MyBCA",
    name: "MyBCA",
    provider: "BCA",
    emailCount: 14,
    lastFours: ["4821"],
  },
  {
    institutionKey: "Mandiri_Livin",
    name: "Livin'",
    provider: "Mandiri",
    emailCount: 9,
    lastFours: ["1730"],
  },
  { institutionKey: "Jago_App", name: "Jago", provider: "Jago", emailCount: 4, lastFours: [] },
].map((bank) => choiceFromSuggestion({ ...bank, platform: "BANKING_APP", linkedAccounts: [] }));

const sampleEmails = 58;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Plays setup with sample banks, so the public demo and design review need no Gmail. */
export function useDemoOnboarding(
  enabled: boolean,
  phase: OnboardingPhase | null,
): OnboardingEngine {
  const [detected, setDetected] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>(waitingProgress);
  const detecting = enabled && phase === "detect";
  const importing = enabled && (phase === "import" || phase === "background");
  const finished = progress.state === "completed";

  useEffect(() => {
    if (!detecting) return;
    const timer = window.setTimeout(() => setDetected(true), 3_200);
    return () => window.clearTimeout(timer);
  }, [detecting]);

  useEffect(() => {
    if (!importing || finished) return;
    let emails = 0;
    const timer = window.setInterval(() => {
      emails = Math.min(sampleEmails, emails + 3 + Math.floor(Math.random() * 3));
      const found = Math.round((emails / sampleEmails) * demoImportFeed.length);
      setProgress({
        state: emails >= sampleEmails ? "completed" : "running",
        emailsRead: emails,
        totalEmails: sampleEmails,
        transactions: found,
        totalTransactions: demoImportFeed.length,
        feed: demoImportFeed.slice(0, found),
      });
      if (emails >= sampleEmails) window.clearInterval(timer);
    }, 650);
    return () => window.clearInterval(timer);
  }, [importing, finished]);

  const connect = useCallback(async (onConnected: () => void) => {
    await wait(1_200);
    onConnected();
  }, []);
  const saveBanks = useCallback(() => wait(500), []);
  const saveName = useCallback(() => wait(500), []);
  const retryDetection = useCallback(() => {
    setDetected(false);
    window.setTimeout(() => setDetected(true), 1_500);
  }, []);

  const detection: Detection = detected
    ? { status: "ready", choices: sampleBanks }
    : { status: "scanning" };
  return { connect, detection, retryDetection, saveBanks, saveName, progress };
}

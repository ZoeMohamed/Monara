"use client";

import type { CreateCustomBankInput } from "@monara/contracts";
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
import { withReachedStep } from "@/lib/onboarding/import-steps";

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
].map((bank) =>
  choiceFromSuggestion({ ...bank, platform: "BANKING_APP", linkedAccounts: [], isNew: false }),
);

const sampleEmails = 58;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Plays setup with sample banks, so the public demo and design review need no Gmail. */
export function useDemoOnboarding(
  enabled: boolean,
  phase: OnboardingPhase | null,
  onCreateBank?: (input: CreateCustomBankInput) => void,
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
    // Finding, reading, then categorizing, the way the live import reports them.
    let found = 0;
    let emails = 0;
    let categorized = 0;
    const timer = window.setInterval(() => {
      if (found < sampleEmails) found = Math.min(sampleEmails, found + 20);
      else emails = Math.min(sampleEmails, emails + 3 + Math.floor(Math.random() * 3));
      const transactions = Math.round((emails / sampleEmails) * demoImportFeed.length);
      categorized =
        emails >= sampleEmails
          ? Math.min(transactions, categorized + 3)
          : Math.floor(transactions / 2);
      const completed = emails >= sampleEmails && categorized >= transactions;
      setProgress((current) =>
        withReachedStep(
          {
            state: completed ? "completed" : "running",
            emailsRead: emails,
            totalEmails: found,
            totalEmailsFinal: true,
            transactions,
            totalTransactions: demoImportFeed.length,
            categorizing: transactions - categorized,
            feed: demoImportFeed.slice(0, transactions),
          },
          current,
        ),
      );
      if (completed) window.clearInterval(timer);
    }, 650);
    return () => window.clearInterval(timer);
  }, [importing, finished]);

  const connect = useCallback(async (onConnected: () => void) => {
    await wait(1_200);
    onConnected();
  }, []);
  const saveBanks = useCallback(
    async (choices: Parameters<OnboardingEngine["saveBanks"]>[0]) => {
      for (const choice of choices)
        if (choice.customInput && !choice.linked) onCreateBank?.(choice.customInput);
      await wait(500);
    },
    [onCreateBank],
  );
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

"use client";

import { Button, ProgressBar } from "@monara/ui";

import { useAppSession } from "@/components/app-session-context";
import { OnboardingMark } from "@/components/onboarding-avatar";
import styles from "@/components/onboarding-sheet.module.css";
import type { ImportProgress } from "@/components/use-onboarding-engine";

function summary(progress: ImportProgress) {
  switch (progress.state) {
    case "completed":
      return progress.transactions === null
        ? "Gmail import finished."
        : `Imported ${progress.transactions} ${progress.transactions === 1 ? "transaction" : "transactions"} from Gmail.`;
    case "failed":
      return "The Gmail import hit a snag.";
    case "running":
      return "Importing from Gmail…";
    case "waiting":
      return "Getting your Gmail import ready…";
  }
}

function progressValue(progress: ImportProgress): number | null {
  const { transactions, totalTransactions } = progress;
  if ((progress.categorizing ?? 0) > 0 || transactions === null || !totalTransactions) return null;
  return Math.round((transactions / totalTransactions) * 100);
}

function progressCount(progress: ImportProgress): string | null {
  if (progress.transactions === null) return null;
  const categorizing = progress.categorizing ?? 0;
  if (categorizing > 0)
    return `${Math.max(0, progress.transactions - categorizing)} / ${progress.transactions} transactions processed`;
  if (!progress.totalTransactions) return null;
  return `${progress.transactions} / ${progress.totalTransactions} transactions found`;
}

/** Background import status, rendered only inside Home's landscape. */
export function OnboardingBanner() {
  const { gmailImport } = useAppSession();
  if (!gmailImport) return null;
  const { progress, onOpen, onFinish } = gmailImport;
  const finished = progress.state === "completed" || progress.state === "failed";
  const value = progressValue(progress);
  const count = progressCount(progress);
  return (
    <div className={styles.banner} role="status">
      <div aria-hidden className={styles.bannerAvatar}>
        <OnboardingMark done={progress.state === "completed"} />
      </div>
      <div className={styles.bannerText}>
        <p className="text-sm font-semibold">{summary(progress)}</p>
        {!finished ? (
          <>
            <ProgressBar
              aria-label="Gmail import progress"
              className="mt-1.5"
              isIndeterminate={value === null ? true : undefined}
              size="sm"
              value={value ?? 0}
            >
              <ProgressBar.Track className={styles.bannerTrack}>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            {count ? <p className={styles.bannerCount}>{count}</p> : null}
          </>
        ) : null}
      </div>
      {finished ? (
        <Button className="min-h-11" onPress={onFinish} variant="secondary">
          OK
        </Button>
      ) : (
        <Button className="min-h-11" onPress={onOpen} variant="secondary">
          Details
        </Button>
      )}
    </div>
  );
}

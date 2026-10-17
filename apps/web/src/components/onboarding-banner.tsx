"use client";

import { Button, ProgressBar } from "@monara/ui";

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

/** Where a background import stays visible after the sheet is closed. */
export function OnboardingBanner({
  progress,
  onOpen,
  onFinish,
  inset,
}: {
  progress: ImportProgress;
  /** Home's content runs edge to edge, so the banner needs its own side margin there. */
  inset: boolean;
  onOpen: () => void;
  onFinish: () => void;
}) {
  const finished = progress.state === "completed" || progress.state === "failed";
  const { transactions, totalTransactions } = progress;
  const counted = transactions !== null && totalTransactions !== null && totalTransactions > 0;
  const value = counted ? Math.round((transactions / totalTransactions) * 100) : null;
  return (
    <div className={styles.banner} data-inset={inset} role="status">
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
            {counted ? (
              <p className={styles.bannerCount}>
                {transactions} / {totalTransactions} processed
              </p>
            ) : null}
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

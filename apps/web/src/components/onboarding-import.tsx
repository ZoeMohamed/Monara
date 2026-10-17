"use client";

import { Button, ProgressBar } from "@monara/ui";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import { useAmountDisplay } from "@/components/app-session-context";
import { OnboardingAvatar } from "@/components/onboarding-avatar";
import { BankBadge } from "@/components/onboarding-bank-badge";
import styles from "@/components/onboarding-import.module.css";
import { ButtonIcon, onboardingTitleId, StepFrame } from "@/components/onboarding-sheet";
import type {
  ImportedKind,
  ImportedTransaction,
  ImportProgress,
} from "@/components/use-onboarding-engine";
import { formatDay } from "@/data/demo-ledger";

const badgeSize = 28;

const kinds: { kind: ImportedKind; label: string }[] = [
  { kind: "expense", label: "Expense" },
  { kind: "income", label: "Income" },
  { kind: "exclusion", label: "Exclusion" },
];

const copy: Record<ImportProgress["state"], { title: string; text: string }> = {
  waiting: {
    title: "Getting ready",
    text: "Lining up your bank emails.",
  },
  running: {
    title: "Importing your transactions",
    text: "Reading the last 30 days of email.",
  },
  completed: {
    title: "All caught up",
    text: "From the last 30 days of email.",
  },
  failed: {
    title: "The import hit a snag",
    text: "Some emails could not be read.",
  },
};

function percent(progress: ImportProgress): number | null {
  if (progress.state === "completed") return 100;
  if (progress.emailsRead === null || !progress.totalEmails) return null;
  return Math.min(100, Math.round((progress.emailsRead / progress.totalEmails) * 100));
}

function hasCounts(progress: ImportProgress) {
  return progress.emailsRead !== null && progress.transactions !== null;
}

function countsLine(progress: ImportProgress) {
  const of = progress.totalEmails ? ` of ${progress.totalEmails}` : "";
  return `${progress.emailsRead}${of} emails · ${progress.transactions} found`;
}

function Stats({ progress }: { progress: ImportProgress }) {
  if (progress.state === "failed") return null;
  const value = percent(progress);
  return (
    <div className={styles.meter}>
      <ProgressBar
        aria-label="Import progress"
        isIndeterminate={value === null && progress.state !== "waiting" ? true : undefined}
        size="sm"
        value={value ?? 0}
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}

function ImportRow({ item }: { item: ImportedTransaction }) {
  const { formatRupiah } = useAmountDisplay();
  const sign = item.kind === "income" ? "+" : item.kind === "expense" ? "−" : "";
  return (
    <li className={styles.row} data-kind={item.kind}>
      <span className={styles.rowBadge}>
        <BankBadge
          name={item.bankName}
          platform="BANKING_APP"
          provider={item.provider}
          size={badgeSize}
        />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowName} title={item.merchant}>
          {item.merchant}
        </span>
        <span className={styles.rowDate}>{formatDay(item.date)}</span>
      </span>
      <span className={styles.rowAmount}>
        {sign}
        {formatRupiah(item.amount)}
      </span>
    </li>
  );
}

function emptyText(progress: ImportProgress, kind: ImportedKind) {
  if (progress.state === "completed") return `No ${kind} transactions found.`;
  return "Transactions appear here as they are found.";
}

function ImportTable({ progress }: { progress: ImportProgress }) {
  const id = useId();
  const [selected, setSelected] = useState<ImportedKind>("expense");
  const tabRefs = useRef<Partial<Record<ImportedKind, HTMLButtonElement | null>>>({});
  const items = progress.feed.filter((item) => item.kind === selected);

  const move = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % kinds.length
        : event.key === "ArrowLeft"
          ? (index + kinds.length - 1) % kinds.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? kinds.length - 1
              : null;
    const target = next === null ? undefined : kinds[next];
    if (!target) return;
    event.preventDefault();
    setSelected(target.kind);
    tabRefs.current[target.kind]?.focus();
  };

  return (
    <>
      <div aria-label="Imported transactions" className={styles.tabs} role="tablist">
        {kinds.map(({ kind, label }, index) => (
          <button
            aria-controls={`${id}-panel`}
            aria-selected={selected === kind}
            className={styles.tab}
            id={`${id}-${kind}`}
            key={kind}
            onClick={() => setSelected(kind)}
            onKeyDown={(event) => move(event, index)}
            ref={(node) => {
              tabRefs.current[kind] = node;
            }}
            role="tab"
            tabIndex={selected === kind ? 0 : -1}
            type="button"
          >
            {label}
            <span className={styles.count}>
              {progress.feed.filter((item) => item.kind === kind).length}
            </span>
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-${selected}`}
        className={styles.panel}
        id={`${id}-panel`}
        role="tabpanel"
        // A scrolling region has to be reachable by keyboard, as the tabs pattern allows.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
        tabIndex={0}
      >
        {items.length === 0 ? (
          <p className={styles.empty}>{emptyText(progress, selected)}</p>
        ) : (
          <ul className={styles.rows}>
            {items.map((item) => (
              <ImportRow item={item} key={item.id} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function ImportStep({ progress, onNext }: { progress: ImportProgress; onNext: () => void }) {
  const done = progress.state === "completed";
  const failed = progress.state === "failed";
  const { title, text } = copy[progress.state];
  return (
    <StepFrame
      actions={
        <Button className="min-h-12" onPress={onNext}>
          {done ? "Explore Monara" : "Next"}
          <ButtonIcon name="arrow" />
        </Button>
      }
      step={3}
    >
      <div className={styles.import}>
        <div className={styles.top}>
          <div>
            <h2 className={styles.title} id={onboardingTitleId}>
              {title}
            </h2>
            <p aria-live="polite" className={styles.sub}>
              {failed && progress.message ? progress.message : text}
            </p>
            {!failed && hasCounts(progress) ? (
              <p className={styles.counts}>{countsLine(progress)}</p>
            ) : null}
          </div>
          <div aria-hidden className={styles.avatar}>
            <OnboardingAvatar scene={done ? "done" : failed ? "empty" : "import"} tight />
          </div>
        </div>
        <Stats progress={progress} />
        <ImportTable progress={progress} />
      </div>
    </StepFrame>
  );
}

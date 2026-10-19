"use client";

import { Button, ProgressBar } from "@monara/ui";
import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from "react";

import { useAmountDisplay } from "@/components/app-session-context";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon, type IconName } from "@/components/icon";
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

type ImportTab = ImportedKind | "review";

const kinds: { kind: ImportTab; label: string; icon: IconName }[] = [
  { kind: "expense", label: "Expense", icon: "trend-up" },
  { kind: "income", label: "Income", icon: "income" },
  { kind: "exclusion", label: "Exclusion", icon: "eye-off" },
  { kind: "review", label: "To review", icon: "inbox" },
];

function matchesTab(item: ImportedTransaction, tab: ImportTab) {
  return tab === "review" ? item.needsReview === true : !item.needsReview && item.kind === tab;
}

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

const avatarScene = {
  waiting: "import",
  running: "import",
  completed: "done",
  failed: "empty",
} as const;

function percent(progress: ImportProgress): number | null {
  if (progress.state === "completed") return 100;
  if (!progress.totalEmailsFinal || (progress.categorizing ?? 0) > 0) return null;
  if (progress.emailsRead === null || !progress.totalEmails) return null;
  return Math.min(100, Math.round((progress.emailsRead / progress.totalEmails) * 100));
}

function hasCounts(progress: ImportProgress) {
  return progress.emailsRead !== null && progress.transactions !== null;
}

function countsLine(progress: ImportProgress) {
  const total = progress.totalEmails === null ? "" : ` / ${progress.totalEmails}`;
  const provisional =
    progress.totalEmails !== null && !progress.totalEmailsFinal && progress.state !== "completed"
      ? " (found so far)"
      : "";
  return `${progress.emailsRead}${total} emails processed${provisional} · ${progress.transactions} transactions found`;
}

function classificationLine(progress: ImportProgress): string | null {
  if (progress.state !== "running" || progress.transactions === null || !progress.categorizing)
    return null;
  const processed = Math.max(0, progress.transactions - progress.categorizing);
  return `${processed} / ${progress.transactions} transactions processed`;
}

function summaryText(progress: ImportProgress): string {
  if (progress.state === "failed" && progress.message) return progress.message;
  if ((progress.categorizing ?? 0) > 0)
    return "Categorizing your transactions. You can leave this running.";
  return copy[progress.state].text;
}

function summaryCounts(progress: ImportProgress): string | null {
  if (progress.state === "failed") return null;
  if (hasCounts(progress)) return countsLine(progress);
  if (progress.state === "completed" && progress.transactions !== null)
    return `${progress.transactions} transactions imported`;
  return null;
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

/** Rows arriving together fade in one after another; ones already shown do not replay. */
const staggeredRows = 8;

function ImportRow({ item, index }: { item: ImportedTransaction; index: number }) {
  const { formatRupiah } = useAmountDisplay();
  const sign = item.kind === "income" ? "+" : item.kind === "expense" ? "−" : "";
  const category = item.category ?? "Uncategorized";
  const style = { "--row-index": Math.min(index, staggeredRows) } as CSSProperties;
  return (
    <li className={styles.row} data-kind={item.kind} style={style}>
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
        <span className={styles.rowCategory}>
          <CategoryAvatar
            className={styles.categoryIcon}
            iconClassName={styles.categoryIcon}
            icon={item.categoryIcon}
            name={category}
            size={12}
          />
          <span className={styles.categoryName}>{category}</span>
        </span>
      </span>
      <span className={styles.rowValue}>
        <span className={styles.rowAmount}>
          {sign}
          {formatRupiah(item.amount)}
        </span>
        <span className={styles.rowDate}>{formatDay(item.date)}</span>
      </span>
    </li>
  );
}

function emptyText(progress: ImportProgress, kind: ImportTab) {
  if (kind === "review") return "No transactions to review yet.";
  if (progress.state === "completed") return `No ${kind} transactions found.`;
  return "Transactions appear here as they are found.";
}

function ImportTable({ progress }: { progress: ImportProgress }) {
  const id = useId();
  const [selected, setSelected] = useState<ImportTab>("expense");
  const tabRefs = useRef<Partial<Record<ImportTab, HTMLButtonElement | null>>>({});
  const items = progress.feed.filter((item) => matchesTab(item, selected));

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
    const tab = tabRefs.current[target.kind];
    tab?.focus();
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <>
      <div aria-label="Imported transactions" className={styles.tabs} role="tablist">
        {kinds.map(({ kind, label, icon }, index) => (
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
            <Icon className={styles.tabIcon} name={icon} />
            {label}
            <span className={styles.count}>
              {progress.feed.filter((item) => matchesTab(item, kind)).length}
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
            {items.map((item, index) => (
              <ImportRow index={index} item={item} key={item.id} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ImportSummary({ progress }: { progress: ImportProgress }) {
  const { title } = copy[progress.state];
  const counts = summaryCounts(progress);
  const classification = classificationLine(progress);
  return (
    <div className={styles.top}>
      <div>
        <h2 className={styles.title} id={onboardingTitleId}>
          {title}
        </h2>
        <p aria-live="polite" className={styles.sub}>
          {summaryText(progress)}
        </p>
        {counts ? <p className={styles.counts}>{counts}</p> : null}
        {classification ? (
          <p className={styles.counts} role="status">
            {classification}
          </p>
        ) : null}
      </div>
      <div aria-hidden className={styles.avatar}>
        <OnboardingAvatar scene={avatarScene[progress.state]} tight />
      </div>
    </div>
  );
}

/** No button while the import runs; closing the sheet leaves it running behind a banner. */
export function ImportStep({ progress, onNext }: { progress: ImportProgress; onNext: () => void }) {
  const done = progress.state === "completed";
  const failed = progress.state === "failed";
  return (
    <StepFrame
      actions={
        done || failed ? (
          <Button className="min-h-12" onPress={onNext}>
            Explore Monara
            <ButtonIcon name="arrow" />
          </Button>
        ) : undefined
      }
      step={3}
    >
      <div className={styles.import}>
        <ImportSummary progress={progress} />
        <Stats progress={progress} />
        <ImportTable progress={progress} />
      </div>
    </StepFrame>
  );
}

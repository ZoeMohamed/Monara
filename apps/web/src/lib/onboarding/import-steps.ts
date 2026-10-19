import type { ImportProgress } from "@/components/use-onboarding-engine";

const importStepLabels = [
  "Reading the last 30 days of email",
  "Extracting transactions",
  "Categorizing transactions",
] as const;

export type ImportStepIndex = 0 | 1 | 2;

export type ImportStepView = {
  label: string;
  state: "done" | "active" | "upcoming";
  /** A count that stays once its step is done: "66 found", "12 / 66", "9 / 40". */
  detail: string | null;
};

/**
 * Which step the counts say the import is in: finding emails, reading them, then
 * categorizing the transactions they held. Extraction and categorization overlap in
 * the backend; the steps follow the work that still gates the import.
 */
export function stepFromCounts(progress: ImportProgress): ImportStepIndex {
  if (progress.state === "waiting") return 0;
  const read = progress.emailsRead ?? 0;
  const total = progress.totalEmails ?? 0;
  if (read === 0) return 0;
  return total > 0 && read >= total ? 2 : 1;
}

/**
 * Stores the furthest step reached. Mail is listed page by page, so a moment where every
 * email found so far is read must not push the import to a step it then leaves again.
 */
export function withReachedStep(next: ImportProgress, current: ImportProgress): ImportProgress {
  return { ...next, step: Math.max(current.step ?? 0, stepFromCounts(next)) as ImportStepIndex };
}

export function currentStep(progress: ImportProgress): ImportStepIndex {
  return progress.step ?? stepFromCounts(progress);
}

function processed(progress: ImportProgress) {
  const transactions = progress.transactions ?? 0;
  return progress.state === "completed"
    ? transactions
    : Math.max(0, transactions - (progress.categorizing ?? 0));
}

export function importSteps(progress: ImportProgress): ImportStepView[] {
  const done = progress.state === "completed";
  const step = currentStep(progress);
  const total = progress.totalEmails ?? 0;
  const read = progress.emailsRead ?? 0;
  const transactions = progress.transactions ?? 0;
  const details = [
    total > 0 ? `${total} found` : null,
    step >= 1 && total > 0 ? `${read} / ${total}` : null,
    step >= 2 && transactions > 0 ? `${processed(progress)} / ${transactions}` : null,
  ];
  return importStepLabels.map((label, index) => ({
    label,
    detail: details[index] ?? null,
    state: done || index < step ? "done" : index === step ? "active" : "upcoming",
  }));
}

/** Reading emails fills the first half of the bar and categorizing the second. */
export function importPercent(progress: ImportProgress): number | null {
  if (progress.state === "completed") return 100;
  const step = currentStep(progress);
  if (step === 1) {
    const total = progress.totalEmails ?? 0;
    return total > 0 ? Math.min(50, Math.round(((progress.emailsRead ?? 0) / total) * 50)) : null;
  }
  if (step === 2) {
    const transactions = progress.transactions ?? 0;
    return transactions > 0 ? 50 + Math.round((processed(progress) / transactions) * 50) : null;
  }
  return null;
}

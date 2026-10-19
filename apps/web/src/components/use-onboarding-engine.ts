"use client";

import type { BankChoice } from "@/lib/onboarding/banks";

/** What the detection step has found so far. */
export type Detection =
  | { status: "scanning" }
  | { status: "ready"; choices: BankChoice[] }
  | { status: "failed"; message: string };

export type ImportedKind = "expense" | "income" | "exclusion";

/** One transaction as the import finds it: enough to show in the progress table. */
export type ImportedTransaction = {
  id: string;
  /** The bank's provider name, which picks its logo. */
  provider: string;
  bankName: string;
  merchant: string;
  /** Always positive; the kind says which way the money moved. */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  kind: ImportedKind;
  needsReview?: boolean;
};

/**
 * How the import is going. Numbers are null when the source cannot say yet; the UI
 * then shows activity without inventing counts.
 */
export type ImportProgress = {
  state: "waiting" | "running" | "completed" | "failed";
  emailsRead: number | null;
  totalEmails: number | null;
  /** Transactions imported so far. */
  transactions: number | null;
  /** Transactions the scan has detected in all, which the count above works toward. */
  totalTransactions: number | null;
  /**
   * What has been imported so far, in the order it was found. Empty when the source cannot
   * list transactions yet; the table then waits instead of inventing rows.
   */
  feed: ImportedTransaction[];
  categorizing?: number;
  needsReview?: number;
  message?: string;
};

export const waitingProgress: ImportProgress = {
  state: "waiting",
  emailsRead: null,
  totalEmails: null,
  transactions: null,
  totalTransactions: null,
  feed: [],
};

/**
 * Everything setup needs from outside the screen. The live engine talks to Gmail and
 * the finance backend; the demo engine plays the same steps with sample banks.
 */
export type OnboardingEngine = {
  /**
   * Sends the User to Gmail consent (live) or plays the connection (demo).
   * onConnected runs right before leaving for consent, or once the demo connects.
   */
  connect: (onConnected: () => void) => Promise<void>;
  detection: Detection;
  retryDetection: () => void;
  /** Creates the Financial Accounts Gmail imports to. Safe to call again after a failure. */
  saveBanks: (choices: BankChoice[]) => Promise<void>;
  /** Stores the full name used to recognise transfers between the User's own accounts. */
  saveName: (fullName: string) => Promise<void>;
  progress: ImportProgress;
};

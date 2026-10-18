"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Detection,
  ImportedTransaction,
  ImportProgress,
  OnboardingEngine,
} from "@/components/use-onboarding-engine";
import { waitingProgress } from "@/components/use-onboarding-engine";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import {
  GmailClientError,
  loadGmailConnections,
  loadGmailDiscovery,
  requestGmailDiscovery,
  startGmailConnection,
} from "@/lib/gmail/client";
import { loadImportFeed } from "@/lib/gmail/import-feed";
import { accountInputFor, choiceFromSuggestion, choicesToCreate } from "@/lib/onboarding/banks";
import type { OnboardingPhase } from "@/lib/onboarding/flow";
import { saveFullName } from "@/lib/profile/client";

const POLL_MS = 3_000;
/** Detection reads a few hundred headers; past this Gmail is probably not answering. */
const DETECTION_TIMEOUT_MS = 90_000;

export function onboardingErrorMessage(error: unknown) {
  return error instanceof FinanceClientError || error instanceof GmailClientError
    ? error.message
    : "That did not work. Try again.";
}

/** The User's connected Gmail mailbox: null when there is none, undefined while checking. */
export function useGmailMailbox(enabled: boolean) {
  const [mailboxId, setMailboxId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadGmailConnections({ signal: controller.signal }).then(
      (mailboxes) => {
        if (controller.signal.aborted) return;
        setMailboxId(mailboxes.find((mailbox) => mailbox.status === "active")?.id ?? null);
      },
      () => {
        // Without a readable list, start at connect; consent will explain any real problem.
        if (!controller.signal.aborted) setMailboxId(null);
      },
    );
    return () => controller.abort();
  }, [enabled]);
  return mailboxId;
}

function useDetection(mailboxId: string | null | undefined, enabled: boolean) {
  const [detection, setDetection] = useState<Detection>({ status: "scanning" });
  const [attempt, setAttempt] = useState(0);
  const forceRequest = useRef(false);

  useEffect(() => {
    // Rerun for a new attempt even when nothing else changed.
    void attempt;
    if (!enabled || !mailboxId) return;
    const connection = mailboxId;
    const controller = new AbortController();
    const { signal } = controller;
    const deadline = Date.now() + DETECTION_TIMEOUT_MS;
    let timer: number | undefined;
    let requested = false;

    const fail = (message: string) => {
      if (!signal.aborted) setDetection({ status: "failed", message });
    };
    const later = (run: () => void, delay = POLL_MS) => {
      timer = window.setTimeout(run, delay);
    };
    const check = (): void => {
      loadGmailDiscovery(connection, { signal })
        .then((discovery) => {
          if (signal.aborted) return;
          if (discovery.state === "completed") {
            setDetection({
              status: "ready",
              choices: discovery.suggestions.map(choiceFromSuggestion),
            });
          } else if (discovery.state === "failed") {
            fail("Your inbox could not be checked. Try again.");
          } else if (Date.now() > deadline) {
            fail("Checking is taking longer than expected. Try again.");
          } else if (discovery.state === "idle" && !requested) {
            requested = true;
            return requestGmailDiscovery(connection, { signal }).then(() => later(check));
          } else {
            later(check);
          }
        })
        .catch((error: unknown) => fail(onboardingErrorMessage(error)));
    };

    if (forceRequest.current) {
      forceRequest.current = false;
      requested = true;
      requestGmailDiscovery(connection, { signal })
        // The search already finished by the time this answers; read its result.
        .then(() => check())
        .catch((error: unknown) => fail(onboardingErrorMessage(error)));
    } else {
      check();
    }
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enabled, mailboxId, attempt]);

  const retry = useCallback(() => {
    forceRequest.current = true;
    setDetection({ status: "scanning" });
    setAttempt((value) => value + 1);
  }, []);
  return { detection, retry };
}

/** Keeps rows already shown in place and puts new ones on top, so only new rows animate in. */
function mergeFeed(current: ImportedTransaction[], latest: ImportedTransaction[]) {
  const shown = new Set(current.map((item) => item.id));
  const added = latest.filter((item) => !shown.has(item.id));
  return added.length === 0 ? current : [...added, ...current];
}

/**
 * Reads how the mailbox's latest sync is going and the transactions it has imported so
 * far. It only reads: starting the import belongs to the backend, which runs it as soon
 * as the accounts exist.
 */
function useImportProgress(mailboxId: string | null | undefined, enabled: boolean) {
  const [progress, setProgress] = useState<ImportProgress>(waitingProgress);
  const finished = progress.state === "completed" || progress.state === "failed";

  useEffect(() => {
    if (!enabled || !mailboxId || finished) return;
    const controller = new AbortController();
    const { signal } = controller;
    const poll = () =>
      Promise.all([loadGmailConnections({ signal }), loadImportFeed(mailboxId, signal)]).then(
        ([mailboxes, feed]) => {
          const sync = mailboxes.find((mailbox) => mailbox.id === mailboxId)?.sync;
          if (signal.aborted || !sync) return;
          setProgress((current) => {
            const merged = mergeFeed(current.feed, feed);
            if (sync.state === "completed") {
              return {
                state: "completed",
                emailsRead: null,
                totalEmails: null,
                transactions: sync.transactions,
                totalTransactions: sync.transactions,
                feed: merged,
              };
            }
            if (sync.state === "failed") {
              return {
                state: "failed",
                emailsRead: null,
                totalEmails: null,
                transactions: null,
                totalTransactions: null,
                feed: merged,
                message: sync.message,
              };
            }
            return {
              ...waitingProgress,
              state: sync.state === "running" ? "running" : "waiting",
              feed: merged,
            };
          });
        },
      );
    // A failed check keeps the last known state; the next one tries again.
    let polling = false;
    const check = () => {
      if (polling) return;
      polling = true;
      void poll()
        .catch(() => undefined)
        .finally(() => {
          polling = false;
        });
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, mailboxId, finished]);

  return progress;
}

/** Setup against the real Gmail connection and finance backend. */
export function useGmailOnboarding(
  mailboxId: string | null | undefined,
  phase: OnboardingPhase | null,
): OnboardingEngine {
  const { detection, retry } = useDetection(mailboxId, phase === "detect");
  const progress = useImportProgress(mailboxId, phase === "import" || phase === "background");
  const created = useRef(new Set<string>());
  // One request id per bank for the life of the sheet, so a retry after a lost response
  // reuses it and cannot create the account twice.
  const requestIds = useRef(new Map<string, string>());

  const connect = useCallback(async (onConnected: () => void) => {
    const url = await startGmailConnection();
    onConnected();
    window.location.assign(url);
  }, []);

  const saveBanks = useCallback(
    async (choices: Parameters<OnboardingEngine["saveBanks"]>[0]) => {
      // A retry after a partial failure must not create the same account twice.
      const missing = choicesToCreate(choices).filter(
        (choice) => !created.current.has(choice.institutionKey),
      );
      const results = await Promise.allSettled(
        missing.map(async (choice) => {
          const requestId = requestIds.current.get(choice.institutionKey) ?? crypto.randomUUID();
          requestIds.current.set(choice.institutionKey, requestId);
          // Each account is fed by the mailbox it was found in.
          await callFinanceOperation(
            "create_financial_account",
            accountInputFor(choice, requestId, mailboxId ?? null),
          );
          created.current.add(choice.institutionKey);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    },
    [mailboxId],
  );

  const saveName = useCallback(async (fullName: string) => {
    await saveFullName(fullName);
  }, []);

  return { connect, detection, retryDetection: retry, saveBanks, saveName, progress };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDemoOnboarding } from "@/components/use-demo-onboarding";
import {
  onboardingErrorMessage,
  useGmailMailbox,
  useGmailOnboarding,
} from "@/components/use-gmail-onboarding";
import type { OnboardingEngine } from "@/components/use-onboarding-engine";
import { useStoredPhase, writeStoredPhase } from "@/components/use-onboarding-phase";
import { gmailCallbackError } from "@/lib/gmail/client";
import type { BankChoice } from "@/lib/onboarding/banks";
import {
  ONBOARDING_RETURN_COOKIE,
  type OnboardingPhase,
  setupPhase,
  showsSheet,
} from "@/lib/onboarding/flow";

function rememberReturn() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Firefox, and the callback route only needs to read this
  document.cookie = `${ONBOARDING_RETURN_COOKIE}=1; Path=/; Max-Age=900; SameSite=Lax${secure}`;
}

export type Onboarding = ReturnType<typeof useOnboarding>;

/** Runs one step's save, tracking whether it is pending and what went wrong. */
function useStepAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (work: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(onboardingErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run };
}

/**
 * First-run setup: connect Gmail, confirm the name while the inbox is searched,
 * confirm the banks found there, then import in the background. The sheet shows for the first three phases; "background" leaves a status
 * banner behind until the User dismisses it.
 */
export function useOnboarding({
  live,
  scope,
  onHome,
  onHomeScreen,
  suggestedName,
  refreshFinance,
}: {
  live: boolean;
  /** Keys this browser's saved progress, so accounts on one device do not share it. */
  scope: string;
  /** Home is showing and nothing is open over it. */
  onHome: boolean;
  /** The Home screen is current, even with a sheet or dialog open over it. */
  onHomeScreen: boolean;
  /** What the name step starts with: the name Google gave Monara, which the User can change. */
  suggestedName: string;
  refreshFinance: () => Promise<void>;
}) {
  const stored = useStoredPhase(scope);
  const mailboxId = useGmailMailbox(live && stored !== "done");
  const phase = setupPhase({ live, stored, mailboxId });

  const gmail = useGmailOnboarding(live ? mailboxId : null, live ? phase : null);
  const demo = useDemoOnboarding(!live, phase);
  const engine: OnboardingEngine = live ? gmail : demo;

  const [dismissed, setDismissed] = useState(false);
  // Leaving the Home screen ends a dismissal, so unfinished setup is offered again on return.
  // Dialogs over Home do not count as leaving, or closing one would bring the sheet back.
  const [wasOnHomeScreen, setWasOnHomeScreen] = useState(onHomeScreen);
  if (wasOnHomeScreen !== onHomeScreen) {
    setWasOnHomeScreen(onHomeScreen);
    if (!onHomeScreen) setDismissed(false);
  }
  const { pending, error, run } = useStepAction();

  // The callback returns here with the outcome of Gmail consent; a failure shows on the first step.
  const [callbackError] = useState(() =>
    typeof window === "undefined"
      ? null
      : (gmailCallbackError(new URL(window.location.href).searchParams.get("gmail")) ?? null),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("gmail")) return;
    url.searchParams.delete("gmail");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // A mailbox with no stored phase was set up before this flow existed; remember that.
  useEffect(() => {
    if (phase === "done" && stored !== "done") writeStoredPhase(scope, "done");
  }, [phase, stored, scope]);

  // Imported records only show up after the app reloads its snapshot.
  const importedRef = useRef(false);
  const importState = engine.progress.state;
  useEffect(() => {
    if (importState !== "completed" || importedRef.current) return;
    if (phase !== "import" && phase !== "background") return;
    importedRef.current = true;
    void refreshFinance().catch(() => undefined);
  }, [importState, phase, refreshFinance]);

  const go = useCallback((next: OnboardingPhase) => writeStoredPhase(scope, next), [scope]);

  const connect = useCallback(
    () =>
      run(() =>
        engine.connect(() => {
          rememberReturn();
          go("name");
        }),
      ),
    [engine, go, run],
  );

  const saveBanks = useCallback(
    (choices: BankChoice[]) =>
      run(async () => {
        await engine.saveBanks(choices);
        await refreshFinance().catch(() => undefined);
        go("import");
      }),
    [engine, go, refreshFinance, run],
  );

  const saveName = useCallback(
    (fullName: string) =>
      run(async () => {
        await engine.saveName(fullName);
        go("detect");
      }),
    [engine, go, run],
  );

  /** Leaves the import step: finished work is done, running work carries on behind a banner. */
  const leaveImport = useCallback(
    () => go(importState === "completed" ? "done" : "background"),
    [go, importState],
  );

  const dismiss = useCallback(() => {
    if (phase === "import") leaveImport();
    else setDismissed(true);
  }, [phase, leaveImport]);

  return {
    phase,
    preparing: live && phase === null && onHome && !dismissed,
    /** The sheet shows on Home for the three setup steps, until the User dismisses it. */
    sheetOpen: onHome && !dismissed && showsSheet(phase),
    bannerOpen: phase === "background",
    suggestedName,
    engine,
    pending,
    error: error ?? callbackError,
    connect,
    saveBanks,
    saveName,
    leaveImport,
    dismiss,
    reopenImport: () => {
      setDismissed(false);
      go("import");
    },
    finish: () => go("done"),
  };
}

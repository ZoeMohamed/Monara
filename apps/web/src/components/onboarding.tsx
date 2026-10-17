"use client";

import { DetectStep } from "@/components/onboarding-detect";
import { ImportStep } from "@/components/onboarding-import";
import { NameStep } from "@/components/onboarding-name";
import { ConnectStep, OnboardingSheet } from "@/components/onboarding-sheet";
import type { Onboarding } from "@/components/use-onboarding";
import { stepIndex } from "@/lib/onboarding/flow";

/** The first-run sheet: connect Gmail, confirm the name, confirm the banks found, then watch the import. */
export function OnboardingSheets({ onboarding }: { onboarding: Onboarding }) {
  const { phase, sheetOpen, engine, pending, error } = onboarding;
  if (!sheetOpen || phase === null) return null;
  return (
    <OnboardingSheet onDismiss={onboarding.dismiss} step={stepIndex(phase)}>
      {phase === "connect" ? (
        <ConnectStep error={error} onConnect={() => void onboarding.connect()} pending={pending} />
      ) : null}
      {phase === "detect" ? (
        <DetectStep
          detection={engine.detection}
          error={error}
          onRetry={engine.retryDetection}
          onSave={(choices) => void onboarding.saveBanks(choices)}
          pending={pending}
        />
      ) : null}
      {phase === "name" ? (
        <NameStep
          error={error}
          initialName={onboarding.suggestedName}
          onSave={(fullName) => void onboarding.saveName(fullName)}
          pending={pending}
        />
      ) : null}
      {phase === "import" ? (
        <ImportStep onNext={onboarding.leaveImport} progress={engine.progress} />
      ) : null}
    </OnboardingSheet>
  );
}

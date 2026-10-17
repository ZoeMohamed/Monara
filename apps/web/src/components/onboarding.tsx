"use client";

import { DetectStep } from "@/components/onboarding-detect";
import { ImportStep } from "@/components/onboarding-import";
import { NameStep } from "@/components/onboarding-name";
import { ConnectStep, OnboardingSheet } from "@/components/onboarding-sheet";
import { useVariant } from "@/components/onboarding-variants/use-variant";
import { VariantPicker } from "@/components/onboarding-variants/variant-picker";
import { allVariants } from "@/components/onboarding-variants/variants";
import type { Onboarding } from "@/components/use-onboarding";
import { stepIndex } from "@/lib/onboarding/flow";

/** The first-run sheet: connect Gmail, confirm the banks found, then watch the import. */
export function OnboardingSheets({ onboarding }: { onboarding: Onboarding }) {
  const { phase, sheetOpen, engine, pending, error } = onboarding;
  const { active } = useVariant();
  if (!sheetOpen || phase === null) return null;
  const density = allVariants.find((variant) => variant.id === active)?.density;
  return (
    <OnboardingSheet
      chrome={phase === "import" ? <VariantPicker /> : undefined}
      onDismiss={onboarding.dismiss}
      step={stepIndex(phase)}
    >
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
        density ? (
          <ImportStep
            density={density}
            onNext={onboarding.leaveImport}
            progress={engine.progress}
          />
        ) : null
      ) : null}
    </OnboardingSheet>
  );
}

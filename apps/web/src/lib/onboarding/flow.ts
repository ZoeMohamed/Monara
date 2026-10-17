/** Where a User is in first-run setup. Stored per User in this browser. */
export type OnboardingPhase = "connect" | "detect" | "name" | "import" | "background" | "done";

const phases: readonly OnboardingPhase[] = [
  "connect",
  "name",
  "detect",
  "import",
  "background",
  "done",
];

export function parseOnboardingPhase(value: unknown): OnboardingPhase | null {
  return phases.find((phase) => phase === value) ?? null;
}

/**
 * The phase to show. A User with a connected mailbox and no stored phase set up Gmail
 * before first-run setup existed, so they are done. Later phases need a mailbox, so
 * without one (a cancelled consent, a disconnect) the User starts over at connect.
 */
export function resolvePhase(stored: OnboardingPhase | null, hasMailbox: boolean): OnboardingPhase {
  if (stored === "done") return "done";
  if (stored === null) return hasMailbox ? "done" : "connect";
  if (!hasMailbox) return "connect";
  return stored === "connect" ? "name" : stored;
}

/**
 * The phase for what is known right now, or null while the live mailbox is still being
 * checked. The demo has no mailbox: it counts as connected once past the first step.
 */
export function setupPhase(input: {
  live: boolean;
  stored: OnboardingPhase | null;
  /** The connected mailbox: null when there is none, undefined while checking. */
  mailboxId: string | null | undefined;
}): OnboardingPhase | null {
  const { live, stored, mailboxId } = input;
  if (stored === "done") return "done";
  if (!live) return resolvePhase(stored, stored !== null && stored !== "connect");
  return mailboxId === undefined ? null : resolvePhase(stored, mailboxId !== null);
}

/** The phases that show the setup sheet; background import shows a banner instead. */
export function showsSheet(phase: OnboardingPhase | null): boolean {
  return phase === "connect" || phase === "detect" || phase === "name" || phase === "import";
}

/** Steps shown as the progress tracker. Background import is still the third step. */
export const onboardingSteps = ["connect", "name", "detect", "import"] as const;

export function stepIndex(phase: OnboardingPhase): number {
  switch (phase) {
    case "connect":
      return 0;
    case "name":
      return 1;
    case "detect":
      return 2;
    default:
      return 3;
  }
}

/**
 * Set in the browser right before Gmail consent when first-run setup started it, so the
 * callback sends the User back to Home instead of the Gmail connections page.
 */
export const ONBOARDING_RETURN_COOKIE = "monara-onboarding";

/** Whether a Cookie header carries the setup return marker. */
export function returnsToOnboarding(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "")
    .split(";")
    .some((part) => part.trim() === `${ONBOARDING_RETURN_COOKIE}=1`);
}

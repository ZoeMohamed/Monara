"use client";

import { Button } from "@monara/ui";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";

import { Icon, type IconName } from "@/components/icon";
import { type AvatarScene, OnboardingAvatar } from "@/components/onboarding-avatar";
import styles from "@/components/onboarding-sheet.module.css";
import { onboardingSteps } from "@/lib/onboarding/flow";

/** The icon inside a step button: an arrow on Next, a check on Done, and so on. */
export function ButtonIcon({ name }: { name: IconName }) {
  return <Icon className="h-5 w-5" name={name} strokeWidth={2.2} />;
}

export const onboardingTitleId = "onboarding-title";

/** The first step the tracker counts: the demo skips connecting Gmail, so it starts at 1. */
const FirstStepContext = createContext(0);

/**
 * The setup sheet: a bottom sheet over a dimmed page. There is no skip button on
 * purpose; tapping the dimmed space above it (or pressing Escape) closes it for now.
 */
export function OnboardingSheet({
  step,
  firstStep = 0,
  onDismiss,
  children,
}: {
  step: number;
  /** Steps before this one are left out of the tracker. */
  firstStep?: number;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native modality keeps focus in the sheet and keeps the page behind it inert.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      aria-labelledby={onboardingTitleId}
      className={styles.layer}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      ref={dialogRef}
    >
      <button
        aria-label="Close setup for now"
        className={styles.scrim}
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <div className={styles.sheet}>
        <div aria-hidden className={styles.tracker}>
          {onboardingSteps.slice(firstStep).map((name, index) => (
            <span
              className={styles.segment}
              data-state={
                index + firstStep < step ? "done" : index + firstStep === step ? "current" : "next"
              }
              key={name}
            />
          ))}
        </div>
        <FirstStepContext.Provider value={firstStep}>{children}</FirstStepContext.Provider>
      </div>
    </dialog>
  );
}

/** The frame every step shares: its screen-reader step label, focus handling, and pinned actions. */
export function StepFrame({
  step,
  actions,
  children,
}: {
  step: number;
  /** Left out while a step has nothing for the User to do. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const firstStep = useContext(FirstStepContext);
  const stepRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Moving to a new step would otherwise drop focus with the button that was pressed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus only when the step changes
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    stepRef.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className={styles.step} ref={stepRef} tabIndex={-1}>
      <span className="sr-only">
        Step {step - firstStep + 1} of {onboardingSteps.length - firstStep}
      </span>
      {children}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

/**
 * One step's layout: avatar, heading, content, and pinned actions. Short steps can sit in
 * the vertical middle; a step with a long list gives it the remaining height to scroll in.
 */
export function SheetStep({
  step,
  scene,
  compact = false,
  avatarHeight,
  centered = false,
  side = false,
  illustration,
  title,
  intro,
  actions,
  list,
  children,
}: {
  step: number;
  scene: AvatarScene;
  compact?: boolean;
  /** Shrinks the avatar to this many pixels tall, to leave room for more content. */
  avatarHeight?: number;
  /** Centers the content in the sheet instead of leaving the space below it empty. */
  centered?: boolean;
  /** Puts the avatar beside the heading instead of above it, to leave room for a list. */
  side?: boolean;
  /** Text under the title; with `side`, it sits beside the avatar too. */
  intro?: ReactNode;
  /** Replaces the plain avatar when a step draws more than the cat. */
  illustration?: ReactNode;
  title: string;
  actions: ReactNode;
  /** A list that scrolls inside the space left under the heading. */
  list?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <StepFrame actions={actions} step={step}>
      <div className={styles.scroll} data-split={list !== undefined}>
        {side ? (
          <div className={styles.head}>
            <div className={styles.headSide}>
              <div>
                <h2 className={styles.title} data-compact id={onboardingTitleId}>
                  {title}
                </h2>
                {intro}
              </div>
              <div aria-hidden className={styles.sideAvatar}>
                <OnboardingAvatar scene={scene} tight />
              </div>
            </div>
            {children}
          </div>
        ) : (
          <div className={styles.head} data-centered={centered}>
            <div
              className={styles.avatar}
              data-compact={compact}
              style={
                avatarHeight
                  ? ({ "--avatar-height": `${avatarHeight}px` } as CSSProperties)
                  : undefined
              }
            >
              {illustration ?? <OnboardingAvatar compact={compact} scene={scene} />}
            </div>
            <h2 className={styles.title} data-compact={compact} id={onboardingTitleId}>
              {title}
            </h2>
            {intro}
            {children}
          </div>
        )}
        {list !== undefined ? <div className={styles.listRegion}>{list}</div> : null}
      </div>
    </StepFrame>
  );
}

/** What Monara does and does not do with the mailbox, said before Google asks. */
const consentPoints: { icon: IconName; lead: string; rest: string }[] = [
  { icon: "eye", lead: "Read only.", rest: "Monara never sends, deletes or changes your email." },
  {
    icon: "bank",
    lead: "Banks and e-wallets only.",
    rest: "Emails from other senders are never opened.",
  },
  {
    icon: "calendar",
    lead: "Starts with the last 30 days.",
    rest: "You can disconnect Gmail whenever you like.",
  },
];

export function ConnectStep({
  pending,
  error,
  onConnect,
}: {
  pending: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <SheetStep
      actions={
        <Button className="min-h-12" isPending={pending} onPress={onConnect}>
          <ButtonIcon name="mail" />
          Connect Gmail
        </Button>
      }
      avatarHeight={128}
      centered
      scene="connect"
      step={0}
      title="Connect your Gmail"
    >
      <ul className={styles.consent}>
        {consentPoints.map((point) => (
          <li className={styles.consentRow} key={point.lead}>
            <span aria-hidden className={styles.consentIcon}>
              <Icon className="h-4 w-4" name={point.icon} strokeWidth={2.2} />
            </span>
            <span>
              <strong>{point.lead}</strong> {point.rest}
            </span>
          </li>
        ))}
      </ul>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </SheetStep>
  );
}

import type { CSSProperties } from "react";

import { Icon } from "@/components/icon";
import styles from "@/components/onboarding-import-steps.module.css";
import type { ImportProgress } from "@/components/use-onboarding-engine";
import { currentStep, importStepLabels, importSteps } from "@/lib/onboarding/import-steps";

/**
 * The import's steps on a short vertical reel: the active step sits in the middle with
 * its number in a blue circle, finished steps slide up and fade, and the next one rises
 * from below into the middle.
 */
export function ImportSteps({ progress }: { progress: ImportProgress }) {
  const active = currentStep(progress);
  return (
    <>
      {/* Only the step is announced; its count changes on every refresh and would be noise. */}
      <p aria-live="polite" className="sr-only" role="status">
        {`Step ${active + 1} of ${importStepLabels.length}: ${importStepLabels[active]}`}
      </p>
      <ol aria-label="Import steps" className={styles.steps}>
        {importSteps(progress).map((step, index) => {
          const offset = index - active;
          return (
            <li
              aria-current={step.state === "active" ? "step" : undefined}
              className={styles.step}
              data-distance={Math.min(Math.abs(offset), 2)}
              data-state={step.state}
              key={step.label}
              style={{ "--offset": offset } as CSSProperties}
            >
              <span aria-hidden className={styles.marker}>
                {step.state === "done" ? <Icon className={styles.check} name="check" /> : index + 1}
              </span>
              <span className={styles.label}>{step.label}</span>
              {step.detail ? <span className={styles.detail}>{step.detail}</span> : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

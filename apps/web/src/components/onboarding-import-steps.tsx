import type { CSSProperties } from "react";

import { Icon } from "@/components/icon";
import styles from "@/components/onboarding-import-steps.module.css";
import type { ImportProgress } from "@/components/use-onboarding-engine";
import { currentStep, importStepLabels, importSteps, reelTop } from "@/lib/onboarding/import-steps";

/**
 * The import's steps on a short vertical reel that starts right under the title: the
 * active step has its number in a blue circle, the step before it stays above as a
 * check, and once a third step begins the oldest one slides up out of the reel.
 */
export function ImportSteps({ progress }: { progress: ImportProgress }) {
  const active = currentStep(progress);
  const top = reelTop(active);
  return (
    <>
      {/* Only the step is announced; its count changes on every refresh and would be noise. */}
      <p aria-live="polite" className="sr-only" role="status">
        {`Step ${active + 1} of ${importStepLabels.length}: ${importStepLabels[active]}`}
      </p>
      <ol
        aria-label="Import steps"
        className={styles.steps}
        style={{ "--rows": importStepLabels.length - top } as CSSProperties}
      >
        {importSteps(progress).map((step, index) => {
          const slot = index - top;
          return (
            <li
              aria-current={step.state === "active" ? "step" : undefined}
              aria-hidden={slot < 0 ? true : undefined}
              className={styles.step}
              data-gone={slot < 0}
              data-state={step.state}
              key={step.label}
              style={{ "--slot-index": slot } as CSSProperties}
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

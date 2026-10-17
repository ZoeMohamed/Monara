"use client";

import { fullNameSchema } from "@monara/contracts";
import { Button } from "@monara/ui";
import { type FormEvent, useId, useState } from "react";

import { OnboardingAvatar } from "@/components/onboarding-avatar";
import { ButtonIcon, SheetStep } from "@/components/onboarding-sheet";
import styles from "@/components/onboarding-sheet.module.css";
import { useStreamedText } from "@/components/use-streamed-text";
import { stepIndex } from "@/lib/onboarding/flow";

const explanation =
  "Moving money between your own accounts isn't spending. Your name helps me spot those and leave them out.";

/** The cat and the speech bubble that explains why Monara asks for a name. */
function Explainer() {
  const { visible, started, done } = useStreamedText(explanation);
  return (
    <div className={styles.chat}>
      <div className={styles.chatCat}>
        <OnboardingAvatar scene="name" />
      </div>
      <div className={styles.bubble}>
        {started ? null : (
          <span aria-hidden className={styles.typing}>
            <i />
            <i />
            <i />
          </span>
        )}
        <p className={styles.bubbleText}>
          {/* Screen readers get the whole message once; the streamed copy is only for the eye. */}
          <span className="sr-only">{explanation}</span>
          <span aria-hidden className={styles.ghost}>
            {explanation}
          </span>
          <span aria-hidden className={styles.live}>
            {visible}
            {started && !done ? <span className={styles.caret} /> : null}
          </span>
        </p>
      </div>
    </div>
  );
}

export function NameStep({
  initialName,
  pending,
  error,
  onSave,
}: {
  initialName: string;
  pending: boolean;
  error: string | null;
  onSave: (fullName: string) => void;
}) {
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const parsed = fullNameSchema.safeParse(name);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (parsed.success && !pending) onSave(parsed.data);
  };

  return (
    <SheetStep
      actions={
        <Button
          className="min-h-12"
          isDisabled={!parsed.success}
          isPending={pending}
          onPress={() => submit()}
        >
          Next
          <ButtonIcon name="arrow" />
        </Button>
      }
      centered
      illustration={<Explainer />}
      scene="name"
      step={stepIndex("name")}
      title="What's your full name?"
    >
      <form className={styles.nameForm} onSubmit={submit}>
        <label className={styles.nameLabel} htmlFor={inputId}>
          Full name
        </label>
        <input
          autoCapitalize="words"
          autoComplete="name"
          className={styles.search}
          id={inputId}
          maxLength={150}
          onChange={(event) => setName(event.target.value)}
          placeholder="As it appears on your bank account"
          spellCheck={false}
          type="text"
          value={name}
        />
        <p className={styles.note}>Only used to recognise your own transfers.</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </SheetStep>
  );
}

"use client";

import type { Institution } from "@monara/contracts";
import { Button } from "@monara/ui";
import { type CSSProperties, useState } from "react";

import { Icon, type IconName } from "@/components/icon";
import { BankBadge } from "@/components/onboarding-bank-badge";
import { ButtonIcon, SheetStep } from "@/components/onboarding-sheet";
import styles from "@/components/onboarding-sheet.module.css";
import type { Detection } from "@/components/use-onboarding-engine";
import {
  addChoice,
  type BankChoice,
  choiceTitle,
  institutionsToAdd,
  removeChoice,
} from "@/lib/onboarding/banks";

function BankBadgeOf({ choice }: { choice: Pick<BankChoice, "provider" | "name" | "platform"> }) {
  return (
    <BankBadge name={choice.name} platform={choice.platform} provider={choice.provider} size={40} />
  );
}

function meta(choice: BankChoice) {
  if (choice.manual) return "Added by you";
  const emails = `${choice.emailCount} ${choice.emailCount === 1 ? "email" : "emails"}`;
  return choice.lastFours.length > 0 ? `${emails} · ending ${choice.lastFours.join(", ")}` : emails;
}

type Mode = "view" | "edit" | "add";

function AddBankPicker({
  choices,
  onPick,
  onBack,
}: {
  choices: BankChoice[];
  onPick: (institution: Institution) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = institutionsToAdd(choices, query);
  return (
    <SheetStep
      actions={
        <Button className="min-h-12" onPress={onBack} variant="secondary">
          <ButtonIcon name="chevron-left" />
          Back
        </Button>
      }
      list={
        results.length === 0 ? (
          <p className={styles.note}>No other banks match that.</p>
        ) : (
          <ul className={styles.list}>
            {results.map((institution) => (
              <li key={institution.key}>
                <button className={styles.pick} onClick={() => onPick(institution)} type="button">
                  <BankBadgeOf choice={institution} />
                  <span className={styles.bankText}>
                    <span className={styles.bankName}>{choiceTitle(institution)}</span>
                  </span>
                  <Icon className="h-5 w-5 text-accent" name="plus" strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        )
      }
      scene="found"
      side
      step={1}
      title="Add a bank"
    >
      <input
        aria-label="Search banks and wallets"
        autoComplete="off"
        className={styles.search}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search BCA, Mandiri, OVO…"
        type="search"
        value={query}
      />
    </SheetStep>
  );
}

function BankRow({
  choice,
  index,
  editing,
  onRemove,
}: {
  choice: BankChoice;
  index: number;
  editing: boolean;
  onRemove: () => void;
}) {
  return (
    <li className={styles.bank} style={{ "--index": index } as CSSProperties}>
      <BankBadgeOf choice={choice} />
      <span className={styles.bankText}>
        <span className={styles.bankName}>{choiceTitle(choice)}</span>
        <span className={styles.bankMeta}>{meta(choice)}</span>
      </span>
      {editing ? (
        <button
          aria-label={`Remove ${choiceTitle(choice)}`}
          className={styles.remove}
          onClick={onRemove}
          type="button"
        >
          <Icon className="h-5 w-5" name="close" strokeWidth={2.2} />
        </button>
      ) : (
        <span aria-hidden className={styles.ticket}>
          <Icon className="h-4 w-4" name="check" strokeWidth={2.6} />
        </span>
      )}
    </li>
  );
}

/** What the sheet says when no bank is listed: nothing found, or the check failed. */
function EmptyBanks({ notice, onRetry }: { notice?: string; onRetry?: () => void }) {
  return (
    <>
      <p className={styles.text}>
        {notice ?? "Add the banks and wallets you use and Monara will watch for them."}
      </p>
      {onRetry ? (
        <Button className="mt-3 min-h-11" onPress={onRetry} variant="secondary">
          Try again
        </Button>
      ) : null}
    </>
  );
}

function emptyTitle(notice: string | undefined) {
  return notice ? "We couldn't check your inbox" : "No bank emails in 30 days";
}

/** Edit or Done on the left; Next on the right, which becomes Add while editing. */
function EditorActions({
  empty,
  editing,
  pending,
  onToggle,
  onAdd,
  onNext,
}: {
  empty: boolean;
  editing: boolean;
  pending: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onNext: () => void;
}) {
  const left: { icon: IconName; label: string } = empty
    ? { icon: "plus", label: "Add a bank" }
    : editing
      ? { icon: "check", label: "Done" }
      : { icon: "pencil", label: "Edit" };
  return (
    <>
      <Button className="min-h-12" isDisabled={pending} onPress={onToggle} variant="secondary">
        <ButtonIcon name={left.icon} />
        {left.label}
      </Button>
      {editing ? (
        <Button className="min-h-12" onPress={onAdd}>
          <ButtonIcon name="plus" />
          Add
        </Button>
      ) : (
        <Button className="min-h-12" isDisabled={empty} isPending={pending} onPress={onNext}>
          Next
          <ButtonIcon name="arrow" />
        </Button>
      )}
    </>
  );
}

/** The banks found in the last 30 days, with room to remove some and add others. */
function BankEditor({
  initial,
  notice,
  pending,
  error,
  onRetry,
  onSave,
}: {
  initial: BankChoice[];
  notice?: string;
  pending: boolean;
  error: string | null;
  onRetry?: () => void;
  onSave: (choices: BankChoice[]) => void;
}) {
  const [choices, setChoices] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const empty = choices.length === 0;
  const editing = mode === "edit" && !empty;

  if (mode === "add") {
    return (
      <AddBankPicker
        choices={choices}
        onBack={() => setMode("edit")}
        onPick={(institution) => {
          setChoices((current) => addChoice(current, institution));
          setMode("edit");
        }}
      />
    );
  }

  const toggle = () => setMode(empty ? "add" : editing ? "view" : "edit");
  return (
    <SheetStep
      actions={
        <EditorActions
          editing={editing}
          empty={empty}
          onAdd={() => setMode("add")}
          onNext={() => onSave(choices)}
          onToggle={toggle}
          pending={pending}
        />
      }
      list={
        empty ? undefined : (
          <ul className={styles.list}>
            {choices.map((choice, index) => (
              <BankRow
                choice={choice}
                editing={editing}
                index={index}
                key={choice.institutionKey}
                onRemove={() =>
                  setChoices((current) => removeChoice(current, choice.institutionKey))
                }
              />
            ))}
          </ul>
        )
      }
      intro={
        empty ? undefined : (
          <p className={styles.text}>
            {editing
              ? "Remove any that are not yours, or add one."
              : "From the last 30 days. Edit if it looks off."}
          </p>
        )
      }
      centered={empty}
      scene={empty ? "empty" : "found"}
      side={!empty}
      step={1}
      title={empty ? emptyTitle(notice) : "We found transactions from these banks"}
    >
      {empty ? <EmptyBanks notice={notice} onRetry={onRetry} /> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </SheetStep>
  );
}

export function DetectStep({
  detection,
  pending,
  error,
  onRetry,
  onSave,
}: {
  detection: Detection;
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  onSave: (choices: BankChoice[]) => void;
}) {
  if (detection.status === "scanning") {
    return (
      <SheetStep
        actions={
          <>
            <Button className="min-h-12" isDisabled variant="secondary">
              <ButtonIcon name="pencil" />
              Edit
            </Button>
            <Button className="min-h-12" isPending>
              Next
              <ButtonIcon name="arrow" />
            </Button>
          </>
        }
        centered
        scene="scan"
        step={1}
        title="Checking your inbox"
      >
        <p aria-live="polite" className={styles.text}>
          Looking for bank and wallet emails from the last 30 days. This takes a few seconds.
        </p>
      </SheetStep>
    );
  }
  // A new key restarts the editor when a retry brings back fresh results.
  const failed = detection.status === "failed";
  return (
    <BankEditor
      error={error}
      initial={detection.status === "ready" ? detection.choices : []}
      key={failed ? "failed" : "ready"}
      {...(failed ? { notice: detection.message, onRetry } : {})}
      onSave={onSave}
      pending={pending}
    />
  );
}

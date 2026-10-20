"use client";

import {
  type CreateCustomBankInput,
  type CustomBank,
  createCustomBankInputSchema,
} from "@monara/contracts";
import { Button } from "@monara/ui";
import { type FormEvent, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { LogoSearch } from "@/components/logo-search";
import { ModalDialog } from "@/components/modal-dialog";
import { brandLogoChoice, brandLogoFromChoice } from "@/data/brand-identity";
import { FinanceClientError } from "@/lib/finance/client";

type Mailbox = { id: string; gmailAddress: string };
type Props = {
  bank?: CustomBank;
  banks: readonly Pick<CustomBank, "id" | "senderEmails">[];
  initialName?: string;
  mailboxes?: readonly Mailbox[];
  onSave: (input: CreateCustomBankInput) => void | Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  titleId?: string;
  embedded?: boolean;
};

function initialDraft(bank?: CustomBank, name = "") {
  return {
    name: bank?.name ?? name,
    platform: bank?.platform ?? ("BANKING_APP" as CreateCustomBankInput["platform"]),
    senderEmails: bank?.senderEmails ?? [""],
    logo: bank?.logo ?? (null as string | null),
    accountName: "",
    lastFour: "",
    mailbox: "",
  };
}

/** One controlled draft and save boundary, used in either existing container. */
function useCustomBankForm({
  bank,
  banks,
  initialName,
  mailboxes = [],
  onSave,
  disabled = false,
}: Props) {
  const prefix = useId();
  const identity = useRef<{ bankId: string; clientRequestId: string } | null>(null);
  const submitted = useRef<CreateCustomBankInput | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState(() => ({
    draft: initialDraft(bank, initialName),
    senderKeys: (bank?.senderEmails ?? [""]).map(() => crypto.randomUUID()),
    pending: false,
    uncertain: false,
    error: null as string | null,
    errors: {} as Record<string, string>,
    search: false,
  }));
  const locked = disabled || state.pending || state.uncertain;
  const { draft } = state;
  const change = (patch: Partial<typeof draft>) =>
    setState((previous) => ({
      ...previous,
      draft: { ...previous.draft, ...patch },
      error: null,
      errors: {},
    }));
  const logo = brandLogoFromChoice(draft.logo);
  const mailbox = draft.mailbox || (mailboxes.length === 1 ? (mailboxes[0]?.id ?? "") : "");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabled) return;
    if (!submitted.current) {
      identity.current ??= {
        bankId: bank?.id ?? crypto.randomUUID(),
        clientRequestId: crypto.randomUUID(),
      };
      const parsed = createCustomBankInputSchema.safeParse({
        ...identity.current,
        name: draft.name,
        platform: draft.platform,
        senderEmails: draft.senderEmails,
        logo: draft.logo,
        accountName: draft.accountName.trim() || draft.name.trim(),
        lastFour: draft.lastFour || null,
        gmailConnectionId: mailbox && mailbox !== "none" ? mailbox : null,
      });
      const errors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
      } else {
        for (const [index, sender] of parsed.data.senderEmails.entries()) {
          if (banks.some((other) => other.id !== bank?.id && other.senderEmails.includes(sender))) {
            errors[`senderEmails.${index}`] =
              "This sender is already used by one of your custom banks. Choose that bank instead.";
          }
        }
      }
      if (!bank && mailboxes.length > 1 && !draft.mailbox)
        errors.mailbox = "Choose an email, or None.";
      if (!parsed.success || Object.keys(errors).length > 0) {
        setState((previous) => ({ ...previous, errors, error: "Check the marked fields." }));
        return;
      }
      submitted.current = parsed.data;
    }
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null }));
    try {
      await onSave(submitted.current);
    } catch (failure) {
      const uncertain =
        failure instanceof FinanceClientError ? failure.actionMayHaveCompleted : true;
      if (!uncertain && !state.uncertain) submitted.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        error:
          failure instanceof Error ? failure.message : "The bank could not be saved. Try again.",
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const errorFor = (field: string) => bankFieldError(prefix, state.errors, field);
  return { prefix, state, draft, locked, change, logo, mailbox, submit, errorFor, setState };
}

type BankFormModel = ReturnType<typeof useCustomBankForm>;
function bankFieldError(prefix: string, errors: Record<string, string>, field: string) {
  return errors[field] ? (
    <p className={styles.error} id={`${prefix}-${field}-error`}>
      {errors[field]}
    </p>
  ) : null;
}

export function CustomBankForm(props: Props) {
  const model = useCustomBankForm(props);
  const { state, submit } = model;
  const { bank, embedded = false, titleId, onCancel, disabled = false, mailboxes = [] } = props;
  return (
    <form
      aria-busy={state.pending}
      className={embedded ? "grid min-w-0 gap-4 text-left" : styles.form}
      noValidate
      onSubmit={submit}
    >
      {!embedded && (
        <h2 className="text-xl font-bold" id={titleId}>
          {bank ? "Edit custom bank" : "Create custom bank"}
        </h2>
      )}
      <BankIdentityFields model={model} bank={bank} />
      <BankSenderFields model={model} />
      <BankLogoFields model={model} />
      <BankAccountFields model={model} bank={bank} mailboxes={mailboxes} />
      <p className={styles.meta}>
        {bank
          ? "Changes apply to every account using this custom bank. Recorded transactions stay as they are."
          : "Only you can use this bank. Your first account is added with it."}
      </p>
      <BankFormFooter
        model={model}
        onCancel={onCancel}
        disabled={disabled}
        bank={bank}
        embedded={embedded}
      />
    </form>
  );
}

export function CustomBankDialog({ onCancel, ...props }: Omit<Props, "embedded" | "titleId">) {
  const titleId = useId();
  const busy = useRef(false);
  const close = () => {
    if (!busy.current) onCancel();
  };
  const save = async (input: CreateCustomBankInput) => {
    busy.current = true;
    try {
      await props.onSave(input);
    } finally {
      busy.current = false;
    }
  };
  return (
    <ModalDialog labelledBy={titleId} onClose={close}>
      <CustomBankForm {...props} onSave={save} onCancel={close} titleId={titleId} />
    </ModalDialog>
  );
}

function BankIdentityFields({ model, bank }: { model: BankFormModel; bank?: CustomBank }) {
  const { prefix, draft, state, locked, change, errorFor } = model;
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${prefix}-name`}>
          Bank name
        </label>
        <input
          aria-describedby={state.errors.name ? `${prefix}-name-error` : undefined}
          aria-invalid={Boolean(state.errors.name)}
          autoComplete="off"
          className={styles.input}
          disabled={locked}
          id={`${prefix}-name`}
          maxLength={100}
          onChange={(event) => change({ name: event.target.value })}
          placeholder="e.g. My local bank"
          value={draft.name}
        />
        {errorFor("name")}
      </div>
      {!bank && (
        <fieldset className={styles.field} disabled={locked}>
          <legend className={styles.label}>Type</legend>
          <div className="mt-1 flex min-w-0 gap-2">
            {(
              [
                ["BANKING_APP", "Bank"],
                ["CREDIT_CARD", "Credit card"],
                ["E_WALLET", "Wallet"],
              ] as const
            ).map(([platform, label]) => (
              <Button
                aria-pressed={draft.platform === platform}
                className="min-h-11 min-w-0 flex-1 rounded-full px-2 text-sm"
                isDisabled={locked}
                key={platform}
                onPress={() => change({ platform })}
                variant={draft.platform === platform ? "primary" : "secondary"}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function BankSenderFields({ model }: { model: BankFormModel }) {
  const { prefix, draft, state, locked, change, errorFor, setState } = model;
  return (
    <fieldset className="grid min-w-0 gap-2" disabled={locked}>
      <legend className={styles.label}>Sender emails</legend>
      <p className={styles.meta} id={`${prefix}-sender-hint`}>
        Use the From address on transaction alerts, rather than the bank’s support email.
      </p>
      {draft.senderEmails.map((sender, index) => (
        <div className="grid min-w-0 gap-1" key={state.senderKeys[index]}>
          <label className="sr-only" htmlFor={`${prefix}-sender-${index}`}>
            Sender email {index + 1}
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <input
              aria-describedby={
                state.errors[`senderEmails.${index}`]
                  ? `${prefix}-senderEmails.${index}-error`
                  : `${prefix}-sender-hint`
              }
              aria-invalid={Boolean(state.errors[`senderEmails.${index}`])}
              autoCapitalize="none"
              autoComplete="off"
              className={`${styles.input} min-w-0 flex-1`}
              disabled={locked}
              id={`${prefix}-sender-${index}`}
              maxLength={320}
              onChange={(event) =>
                change({
                  senderEmails: draft.senderEmails.map((item, position) =>
                    position === index ? event.target.value : item,
                  ),
                })
              }
              placeholder="alerts@examplebank.com"
              spellCheck={false}
              type="email"
              value={sender}
            />
            {draft.senderEmails.length > 1 && (
              <Button
                aria-label={`Remove sender email ${index + 1}`}
                className="min-h-11 shrink-0"
                isDisabled={locked}
                isIconOnly
                onPress={() =>
                  setState((previous) => ({
                    ...previous,
                    draft: {
                      ...previous.draft,
                      senderEmails: previous.draft.senderEmails.filter(
                        (_, position) => position !== index,
                      ),
                    },
                    senderKeys: previous.senderKeys.filter((_, position) => position !== index),
                    errors: {},
                    error: null,
                  }))
                }
                variant="ghost"
              >
                <Icon name="close" />
              </Button>
            )}
          </div>
          {errorFor(`senderEmails.${index}`)}
        </div>
      ))}
      {errorFor("senderEmails")}
      <Button
        className="min-h-11 justify-self-start rounded-full"
        isDisabled={locked || draft.senderEmails.length >= 20}
        onPress={() =>
          setState((previous) => ({
            ...previous,
            draft: { ...previous.draft, senderEmails: [...previous.draft.senderEmails, ""] },
            senderKeys: [...previous.senderKeys, crypto.randomUUID()],
            errors: {},
            error: null,
          }))
        }
        variant="ghost"
      >
        <Icon name="plus" />
        Add another email
      </Button>
    </fieldset>
  );
}

function BankLogoFields({ model }: { model: BankFormModel }) {
  const { draft, logo, locked, state, setState, change, errorFor } = model;
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-h-11 items-center gap-3">
        {logo ? (
          <BrandMark brand={logo} size={36} />
        ) : (
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-surface-secondary"
          >
            <Icon name={draft.platform === "E_WALLET" ? "wallet" : "bank"} />
          </span>
        )}
        <p className="min-w-0 flex-1 text-sm text-muted">Logo (optional)</p>
        <Button
          aria-expanded={state.search}
          className="min-h-11 rounded-full"
          isDisabled={locked}
          onPress={() => setState((previous) => ({ ...previous, search: !previous.search }))}
          variant="secondary"
        >
          {state.search ? "Close search" : "Choose logo"}
        </Button>
      </div>
      {state.search && (
        <LogoSearch
          disabled={locked}
          kinds={[draft.platform === "E_WALLET" ? "wallet" : "bank"]}
          onPick={(picked) => {
            change({ logo: brandLogoChoice(picked) });
            setState((previous) => ({ ...previous, search: false }));
          }}
          selected={logo}
          suggestionQuery={draft.name}
        />
      )}
      {logo && (
        <Button
          className="min-h-11 justify-self-start"
          isDisabled={locked}
          onPress={() => change({ logo: null })}
          variant="ghost"
        >
          Use default icon
        </Button>
      )}
      {errorFor("logo")}
    </div>
  );
}

function BankAccountFields({
  model,
  bank,
  mailboxes,
}: {
  model: BankFormModel;
  bank?: CustomBank;
  mailboxes: readonly Mailbox[];
}) {
  const { prefix, draft, state, locked, change, errorFor, mailbox } = model;
  return (
    <>
      {!bank && (
        <details className="min-w-0 rounded-2xl bg-surface-secondary p-3">
          <summary className="min-h-8 cursor-pointer text-sm font-semibold">
            Account details (optional)
          </summary>
          <div className="mt-3 grid gap-3">
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${prefix}-account`}>
                Account nickname
              </label>
              <input
                className={styles.input}
                disabled={locked}
                id={`${prefix}-account`}
                maxLength={100}
                onChange={(event) => change({ accountName: event.target.value })}
                placeholder={draft.name || "Same as bank name"}
                value={draft.accountName}
              />
              {errorFor("accountName")}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${prefix}-lastFour`}>
                Last 4 digits
              </label>
              <input
                aria-invalid={Boolean(state.errors.lastFour)}
                className={styles.input}
                disabled={locked}
                id={`${prefix}-lastFour`}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => change({ lastFour: event.target.value.replace(/\D/g, "") })}
                value={draft.lastFour}
              />
              {errorFor("lastFour")}
            </div>
          </div>
        </details>
      )}
      {!bank && mailboxes.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}-mailbox`}>
            Email for these alerts
          </label>
          <select
            aria-invalid={Boolean(state.errors.mailbox)}
            className={styles.input}
            disabled={locked}
            id={`${prefix}-mailbox`}
            onChange={(event) => change({ mailbox: event.target.value })}
            value={mailbox}
          >
            <option disabled value="">
              Choose an email
            </option>
            {mailboxes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.gmailAddress}
              </option>
            ))}
            <option value="none">None (I’ll add transactions myself)</option>
          </select>
          {errorFor("mailbox")}
        </div>
      )}
    </>
  );
}

function bankSubmitLabel(state: BankFormModel["state"], editing: boolean, embedded: boolean) {
  if (state.pending) return "Saving…";
  if (state.uncertain) return "Retry same change";
  if (editing) return "Save changes";
  return embedded ? "Add bank" : "Create bank";
}
function BankFormFooter({
  model,
  onCancel,
  disabled,
  bank,
  embedded,
}: Pick<Props, "onCancel" | "disabled" | "bank" | "embedded"> & { model: BankFormModel }) {
  const { state } = model;
  return (
    <>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state.uncertain && (
        <p className={styles.meta}>
          The result could not be verified. Retry the same change, or close and refresh your
          records.
        </p>
      )}
      <div className={styles.footer}>
        <Button
          className="min-h-11"
          isDisabled={state.pending}
          onPress={onCancel}
          variant="secondary"
        >
          {embedded ? "Back" : "Cancel"}
        </Button>
        <Button className="min-h-11" isDisabled={disabled || state.pending} type="submit">
          {bankSubmitLabel(state, Boolean(bank), Boolean(embedded))}
        </Button>
      </div>
    </>
  );
}

"use client";

import {
  type CreateFinancialAccountInput,
  createFinancialAccountInputSchema,
} from "@monara/contracts";
import { Button } from "@monara/ui";
import { type FormEvent, useId, useRef, useState } from "react";

import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type AccountDraft = { name: string; accountType: "bank" | "wallet" | "cash"; institution: string };
type AccountErrors = Partial<Record<keyof AccountDraft, string>>;

function AccountFields({
  draft,
  errors,
  disabled,
  onChange,
}: {
  draft: AccountDraft;
  errors: AccountErrors;
  disabled: boolean;
  onChange: (patch: Partial<AccountDraft>) => void;
}) {
  const prefix = useId();
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${prefix}-name`}>
          Account name
        </label>
        <input
          aria-describedby={errors.name ? `${prefix}-name-error` : `${prefix}-name-hint`}
          aria-invalid={Boolean(errors.name)}
          className={styles.input}
          disabled={disabled}
          id={`${prefix}-name`}
          maxLength={100}
          name="name"
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="e.g. BCA, GoPay or Cash"
          value={draft.name}
        />
        <p className={styles.meta} id={`${prefix}-name-hint`}>
          A name for the bank account, wallet or cash you track.
        </p>
        {errors.name && (
          <p className={styles.error} id={`${prefix}-name-error`}>
            {errors.name}
          </p>
        )}
      </div>
      <fieldset className={styles.field} disabled={disabled}>
        <legend className={styles.label}>Type</legend>
        <div className="mt-1 flex gap-2">
          {(["bank", "wallet", "cash"] as const).map((type) => (
            <Button
              aria-pressed={draft.accountType === type}
              className="min-h-11 min-w-0 flex-1 rounded-full px-3"
              isDisabled={disabled}
              key={type}
              onPress={() => onChange({ accountType: type })}
              variant={draft.accountType === type ? "primary" : "secondary"}
            >
              {type === "bank" ? "Bank" : type === "wallet" ? "Wallet" : "Cash"}
            </Button>
          ))}
        </div>
      </fieldset>
      {draft.accountType !== "cash" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}-institution`}>
            Institution <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            aria-describedby={errors.institution ? `${prefix}-institution-error` : undefined}
            aria-invalid={Boolean(errors.institution)}
            className={styles.input}
            disabled={disabled}
            id={`${prefix}-institution`}
            maxLength={150}
            name="institution"
            onChange={(event) => onChange({ institution: event.target.value })}
            value={draft.institution}
          />
          {errors.institution && (
            <p className={styles.error} id={`${prefix}-institution-error`}>
              {errors.institution}
            </p>
          )}
        </div>
      )}
      <p className={styles.meta}>Currency: Indonesian rupiah (IDR).</p>
    </>
  );
}

function AccountForm({ onClose, ...props }: FinanceManagerProps & { onClose: () => void }) {
  const [state, setState] = useState({
    draft: { name: "", accountType: "bank", institution: "" } as AccountDraft,
    errors: {} as AccountErrors,
    pending: false,
    uncertain: false,
    error: null as string | null,
    discard: false,
  });
  const request = useRef<CreateFinancialAccountInput | null>(null);
  const inFlight = useRef(false);
  const close = () => {
    if (inFlight.current) return;
    if (!state.discard && !state.uncertain && (state.draft.name || state.draft.institution)) {
      setState((previous) => ({ ...previous, discard: true }));
    } else onClose();
  };
  const change = (patch: Partial<AccountDraft>) =>
    setState((previous) => ({
      ...previous,
      draft: { ...previous.draft, ...patch },
      errors: {},
    }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || props.refreshRequired) return;
    if (!request.current) {
      const parsed = createFinancialAccountInputSchema.safeParse({
        name: state.draft.name.trim(),
        accountType: state.draft.accountType,
        institution:
          state.draft.accountType === "cash" ? null : state.draft.institution.trim() || null,
        currency: "IDR",
        lastFour: null,
        clientRequestId: "preflight",
      });
      if (!parsed.success) {
        const errors: AccountErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field === "name" || field === "institution" || field === "accountType")
            errors[field] ??= issue.message;
        }
        setState((previous) => ({ ...previous, errors, error: "Check the marked fields." }));
        return;
      }
      request.current = { ...parsed.data, clientRequestId: crypto.randomUUID() };
    }
    const submitted = request.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, errors: {} }));
    try {
      await props.runMutation(() => callFinanceOperation("create_financial_account", submitted));
      onClose();
    } catch (error) {
      const uncertain = error instanceof FinanceClientError && error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "The result could not be verified. Refresh your records.",
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const locked = state.pending || state.uncertain || Boolean(props.refreshRequired);
  return (
    <ModalDialog labelledBy="account-setup-title" onClose={close}>
      <form aria-busy={state.pending} className={styles.form} noValidate onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" id="account-setup-title">
            {state.discard ? "Discard changes?" : "Add a financial account"}
          </h2>
          <Button
            aria-label="Close account form"
            isDisabled={state.pending}
            isIconOnly
            onPress={close}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {state.discard ? (
          <>
            <p className="text-sm text-muted">Your entries have not been saved.</p>
            <div className={styles.footer}>
              <Button onPress={onClose} variant="secondary">
                Discard changes
              </Button>
              <Button
                autoFocus
                onPress={() => setState((previous) => ({ ...previous, discard: false }))}
              >
                Keep editing
              </Button>
            </div>
          </>
        ) : (
          <>
            <AccountFields
              disabled={locked}
              draft={state.draft}
              errors={state.errors}
              onChange={change}
            />
            {state.error && (
              <p className={styles.error} role="alert">
                {state.error}
              </p>
            )}
            {(props.refreshRequired || state.uncertain) && (
              <FinanceRecovery
                message="Check your records before retrying. A retry will use the same submitted values."
                onRefreshRecords={props.onRefreshRecords}
              />
            )}
            <div className={styles.footer}>
              <Button
                className="min-h-11"
                isDisabled={state.pending}
                onPress={close}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                className="min-h-11"
                isDisabled={state.pending || Boolean(props.refreshRequired)}
                type="submit"
              >
                {state.pending ? "Saving…" : state.uncertain ? "Retry same change" : "Add account"}
              </Button>
            </div>
          </>
        )}
      </form>
    </ModalDialog>
  );
}

export function FinancialAccountSetup({
  allowAdditional = false,
  ...props
}: FinanceManagerProps & { allowAdditional?: boolean }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const accounts = props.snapshot.financialAccounts;
  if (!allowAdditional && accounts.some((account) => account.isActive)) return null;
  return (
    <section aria-labelledby={titleId} className={`${styles.item} mt-4`}>
      <h2 className="text-base font-bold" id={titleId}>
        {allowAdditional ? "Financial accounts" : "Where do you keep your money?"}
      </h2>
      {allowAdditional && accounts.length > 0 ? (
        <ul className="mt-2 divide-y divide-separator">
          {accounts.map((account) => (
            <li className="flex min-h-16 items-center gap-3 py-2.5" key={account.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{account.name}</p>
                <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">
                  {account.accountType === "bank"
                    ? "Bank"
                    : account.accountType === "wallet"
                      ? "Wallet"
                      : "Cash"}
                  {account.institution ? ` · ${account.institution}` : ""} · {account.currency}
                </p>
              </div>
              {!account.isActive ? (
                <span className="shrink-0 text-xs text-muted">Inactive</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm leading-6 text-muted">
          Add your first bank account, wallet or cash to log payments in your own space.
        </p>
      )}
      <Button
        className="mt-3 min-h-11 rounded-full"
        isDisabled={Boolean(props.refreshRequired)}
        onPress={() => setOpen(true)}
      >
        <Icon name="plus" />
        {allowAdditional ? "Add account" : "Add financial account"}
      </Button>
      {open && <AccountForm {...props} onClose={() => setOpen(false)} />}
    </section>
  );
}

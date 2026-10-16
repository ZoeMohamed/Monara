"use client";

import {
  type CreateFinancialAccountInput,
  createFinancialAccountInputSchema,
  type FinancialAccount,
  type Institution,
  institutions,
} from "@monara/contracts";
import { Button } from "@monara/ui";
import { type FormEvent, useId, useRef, useState } from "react";

import { AccountBadge } from "@/components/account-badge";
import { BrandLogoField } from "@/components/brand-logo-field";
import { BrandMark } from "@/components/brand-mark";
import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { type BrandIdentity, brands } from "@/data/brand-identity";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type AccountDraft = {
  name: string;
  accountType: "bank" | "wallet" | "cash";
  institution: string;
  /** Registry entry whose Gmail notifications belong to this account; "" for none. */
  institutionKey: string;
  lastFour: string;
};
type AccountErrors = Partial<Record<keyof AccountDraft, string>>;

const emptyDraft: AccountDraft = {
  name: "",
  accountType: "bank",
  institution: "",
  institutionKey: "",
  lastFour: "",
};

/** Registry entries that fit an account type: banks and cards, or wallets. */
function notificationChoices(accountType: AccountDraft["accountType"]): Institution[] {
  if (accountType === "cash") return [];
  return institutions
    .filter((entry) =>
      accountType === "wallet" ? entry.platform === "E_WALLET" : entry.platform !== "E_WALLET",
    )
    .toSorted((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

/** The values a draft submits, with the Gmail fields cleared for cash. */
function accountValues(draft: AccountDraft) {
  const cash = draft.accountType === "cash";
  return {
    name: draft.name.trim(),
    accountType: draft.accountType,
    institution: cash ? null : draft.institution.trim() || null,
    currency: "IDR" as const,
    lastFour: cash ? null : draft.lastFour.trim() || null,
    institutionKey: cash ? null : draft.institutionKey || null,
  };
}

// The most common Indonesian choices first; the logo search finds every other one.
const institutionChoices = {
  bank: ["bca", "mandiri", "bri", "bni", "bsi", "jago", "blu", "seabank"],
  wallet: ["gopay", "ovo", "dana", "shopeepay", "paypal"],
  cash: [],
} as const satisfies Record<AccountDraft["accountType"], readonly BrandIdentity[]>;

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
  const chooseInstitution = (institution: string) =>
    onChange({ institution, ...(draft.name.trim() ? {} : { name: institution }) });
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
          <fieldset className="mt-2 flex flex-wrap gap-2">
            <legend className="sr-only">Common institutions</legend>
            {institutionChoices[draft.accountType].map((brand) => {
              const institution = brands[brand].name;
              return (
                <Button
                  aria-pressed={draft.institution === institution}
                  className="h-auto min-h-11 rounded-xl px-2.5 py-1.5 text-xs"
                  isDisabled={disabled}
                  key={brand}
                  onPress={() => chooseInstitution(institution)}
                  variant={draft.institution === institution ? "secondary" : "ghost"}
                >
                  <BrandMark brand={brand} size={28} />
                  {institution}
                </Button>
              );
            })}
          </fieldset>
          <div className="mt-2">
            <BrandLogoField
              disabled={disabled}
              kinds={[draft.accountType]}
              label={draft.institution}
              onUseName={chooseInstitution}
              scope="institution"
            />
          </div>
          {errors.institution && (
            <p className={styles.error} id={`${prefix}-institution-error`}>
              {errors.institution}
            </p>
          )}
        </div>
      )}
      {draft.accountType !== "cash" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}-notifications`}>
            Gmail notifications from <span className="font-normal text-muted">(optional)</span>
          </label>
          <select
            className={styles.input}
            disabled={disabled}
            id={`${prefix}-notifications`}
            name="institutionKey"
            onChange={(event) => onChange({ institutionKey: event.target.value })}
            value={draft.institutionKey}
            aria-describedby={`${prefix}-notifications-hint`}
          >
            <option value="">None</option>
            {notificationChoices(draft.accountType).map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name === entry.provider ? entry.name : `${entry.provider} · ${entry.name}`}
                {entry.senderEmails.length === 0 ? " (no email alerts yet)" : ""}
              </option>
            ))}
          </select>
          <p className={styles.meta} id={`${prefix}-notifications-hint`}>
            Transactions from these emails are added to this account.
          </p>
        </div>
      )}
      {draft.accountType !== "cash" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}-last-four`}>
            Last 4 digits <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            aria-describedby={
              errors.lastFour ? `${prefix}-last-four-error` : `${prefix}-last-four-hint`
            }
            aria-invalid={Boolean(errors.lastFour)}
            className={styles.input}
            disabled={disabled}
            id={`${prefix}-last-four`}
            inputMode="numeric"
            maxLength={4}
            name="lastFour"
            onChange={(event) => onChange({ lastFour: event.target.value.replace(/\D/g, "") })}
            value={draft.lastFour}
          />
          <p className={styles.meta} id={`${prefix}-last-four-hint`}>
            Tells apart two cards or accounts from the same bank.
          </p>
          {errors.lastFour && (
            <p className={styles.error} id={`${prefix}-last-four-error`}>
              {errors.lastFour}
            </p>
          )}
        </div>
      )}
      <p className={styles.meta}>Use this account for payments and transfers · IDR.</p>
    </>
  );
}

function AccountForm({ onClose, ...props }: FinanceManagerProps & { onClose: () => void }) {
  const [state, setState] = useState({
    draft: emptyDraft,
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
        ...accountValues(state.draft),
        clientRequestId: "preflight",
      });
      if (!parsed.success) {
        const errors: AccountErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (
            field === "name" ||
            field === "institution" ||
            field === "accountType" ||
            field === "lastFour"
          )
            errors[field] ??= field === "lastFour" ? "Enter exactly 4 digits." : issue.message;
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
            {state.discard ? "Discard changes?" : "Add a bank or wallet"}
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
        {allowAdditional ? "Banks & wallets" : "Where do you keep your money?"}
      </h2>
      {allowAdditional && accounts.length > 0 ? (
        <ul className="mt-2 divide-y divide-separator">
          {accounts.map((account) => (
            <li className="flex min-h-16 items-center gap-3 py-2.5" key={account.id}>
              <AccountBadge account={account} name={account.name} />
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
        {allowAdditional ? "Add bank or wallet" : "Add your first account"}
      </Button>
      {open && <AccountForm {...props} onClose={() => setOpen(false)} />}
    </section>
  );
}

export function DemoFinancialAccountSetup({
  accounts,
  onCreate,
}: {
  accounts: FinancialAccount[];
  onCreate: (input: Omit<CreateFinancialAccountInput, "clientRequestId">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onCreate(accountValues(draft));
      setOpen(false);
      setDraft(emptyDraft);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the account details.");
    }
  };
  return (
    <section aria-labelledby="demo-accounts-title" className={`${styles.item} mt-4`}>
      <h2 className="text-base font-bold" id="demo-accounts-title">
        Banks & wallets
      </h2>
      <ul className="mt-2 divide-y divide-separator">
        {accounts.map((account) => (
          <li className="flex min-h-16 items-center gap-3 py-3" key={account.id}>
            <AccountBadge account={account} name={account.name} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{account.name}</p>
              <p className="mt-1 text-xs text-muted">
                {account.accountType === "wallet"
                  ? "E-wallet"
                  : account.accountType === "bank"
                    ? "Bank"
                    : "Cash"}
                {account.institution ? ` · ${account.institution}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Button className="mt-3 min-h-11 rounded-full" onPress={() => setOpen(true)}>
        <Icon name="plus" />
        Add bank or wallet
      </Button>
      {open && (
        <ModalDialog labelledBy="demo-account-title" onClose={() => setOpen(false)}>
          <form className={styles.form} noValidate onSubmit={submit}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold" id="demo-account-title">
                Add a bank or wallet
              </h2>
              <Button
                aria-label="Close account form"
                isIconOnly
                onPress={() => setOpen(false)}
                variant="ghost"
              >
                <Icon name="close" />
              </Button>
            </div>
            <AccountFields
              disabled={false}
              draft={draft}
              errors={{}}
              onChange={(patch) => {
                setDraft((previous) => ({ ...previous, ...patch }));
                setError(null);
              }}
            />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <p className={styles.meta}>Demo visit only.</p>
            <div className={styles.footer}>
              <Button onPress={() => setOpen(false)} variant="secondary">
                Cancel
              </Button>
              <Button type="submit">Add account</Button>
            </div>
          </form>
        </ModalDialog>
      )}
    </section>
  );
}

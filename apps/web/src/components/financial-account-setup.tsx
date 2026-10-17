"use client";

import {
  type CreateFinancialAccountInput,
  createFinancialAccountInputSchema,
  type FinancialAccount,
  type Institution,
  institutions,
  type UpdateFinancialAccountInput,
  updateFinancialAccountInputSchema,
} from "@monara/contracts";
import { Button, Input, Label, TextField } from "@monara/ui";
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
type DemoAccountChanges = Partial<
  Pick<FinancialAccount, "name" | "institution" | "accountType" | "isActive">
>;

function draftOf(account?: FinancialAccount): AccountDraft {
  return {
    name: account?.name ?? "",
    accountType: account?.accountType ?? "bank",
    institution: account?.institution ?? "",
    institutionKey: account?.institutionKey ?? "",
    lastFour: account?.lastFour ?? "",
  };
}

function accountChanges(draft: AccountDraft) {
  return {
    name: draft.name.trim(),
    accountType: draft.accountType,
    institution: draft.accountType === "cash" ? null : draft.institution.trim() || null,
    lastFour: draft.accountType === "cash" ? null : draft.lastFour.trim() || null,
    institutionKey: draft.accountType === "cash" ? null : draft.institutionKey || null,
  };
}

function accountErrors(issues: { path: readonly PropertyKey[]; message: string }[]): AccountErrors {
  const errors: AccountErrors = {};
  for (const issue of issues) {
    const field = issue.path[0] === "changes" ? issue.path[1] : issue.path[0];
    if (
      field === "name" ||
      field === "institution" ||
      field === "accountType" ||
      field === "lastFour"
    ) {
      errors[field] ??= field === "lastFour" ? "Enter exactly 4 digits." : issue.message;
    }
  }
  return errors;
}

function accountErrorsFromFields(fields?: Record<string, string[]>): AccountErrors {
  return {
    ...(fields?.["changes.name"]?.[0] ? { name: fields["changes.name"][0] } : {}),
    ...(fields?.["changes.institution"]?.[0]
      ? { institution: fields["changes.institution"][0] }
      : {}),
    ...(fields?.["changes.accountType"]?.[0]
      ? { accountType: fields["changes.accountType"][0] }
      : {}),
  };
}

function accountMatchesChanges(
  account: FinancialAccount,
  changes: UpdateFinancialAccountInput["changes"],
) {
  return (
    (changes.name === undefined || account.name === changes.name) &&
    (changes.institution === undefined || account.institution === changes.institution) &&
    (changes.accountType === undefined || account.accountType === changes.accountType) &&
    (changes.currency === undefined || account.currency === changes.currency) &&
    (changes.lastFour === undefined || account.lastFour === changes.lastFour) &&
    (changes.institutionKey === undefined || account.institutionKey === changes.institutionKey) &&
    (changes.isActive === undefined || account.isActive === changes.isActive)
  );
}

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
      <TextField
        className={styles.field}
        isDisabled={disabled}
        isInvalid={Boolean(errors.name)}
        name="name"
        onChange={(name) => onChange({ name })}
        value={draft.name}
      >
        <Label className={styles.label} htmlFor={`${prefix}-name`}>
          Account name
        </Label>
        <Input
          aria-describedby={errors.name ? `${prefix}-name-error` : `${prefix}-name-hint`}
          className={styles.input}
          id={`${prefix}-name`}
          maxLength={100}
          placeholder="e.g. BCA, GoPay or Cash"
        />
        <p className={styles.meta} id={`${prefix}-name-hint`}>
          A name for the bank account, wallet or cash you track.
        </p>
        {errors.name && (
          <p className={styles.error} id={`${prefix}-name-error`}>
            {errors.name}
          </p>
        )}
      </TextField>
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
          <TextField
            className={styles.field}
            isDisabled={disabled}
            isInvalid={Boolean(errors.institution)}
            name="institution"
            onChange={(institution) => onChange({ institution })}
            value={draft.institution}
          >
            <Label className={styles.label} htmlFor={`${prefix}-institution`}>
              Institution <span className="font-normal text-muted">(optional)</span>
            </Label>
            <Input
              aria-describedby={errors.institution ? `${prefix}-institution-error` : undefined}
              className={styles.input}
              id={`${prefix}-institution`}
              maxLength={150}
            />
          </TextField>
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
      <p className={styles.meta}>Use this account for your transactions · IDR.</p>
    </>
  );
}

function AccountForm({ onClose, ...props }: FinanceManagerProps & { onClose: () => void }) {
  const [state, setState] = useState({
    draft: draftOf(),
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
        const errors = accountErrors(parsed.error.issues);
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

type AccountEditorProps = FinanceManagerProps & {
  account: FinancialAccount;
  onClose: () => void;
};

type AccountEditorState = {
  draft: AccountDraft;
  errors: AccountErrors;
  mode: "edit" | "status";
  pending: boolean;
  uncertain: boolean;
  conflict: boolean;
  error: string | null;
};

function useAccountEditor({ account, onClose, ...props }: AccountEditorProps) {
  const original = useRef(account);
  const request = useRef<UpdateFinancialAccountInput | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState<AccountEditorState>({
    draft: draftOf(account),
    errors: {},
    mode: "edit",
    pending: false,
    uncertain: false,
    conflict: false,
    error: null as string | null,
  });
  const current = props.snapshot.financialAccounts.find((item) => item.id === original.current.id);
  const versionChanged = current?.updatedAt !== original.current.updatedAt;
  const reconciled = Boolean(
    state.uncertain &&
      versionChanged &&
      current &&
      request.current &&
      accountMatchesChanges(current, request.current.changes),
  );
  const blocked = Boolean(props.refreshRequired) || versionChanged || state.conflict;
  const values = accountChanges(state.draft);
  const unchanged = accountMatchesChanges(original.current, values);
  const locked = state.pending || state.uncertain || blocked;
  const active = current?.isActive ?? original.current.isActive;
  const close = () => {
    if (!inFlight.current) onClose();
  };
  const change = (patch: Partial<AccountDraft>) =>
    setState((previous) => ({
      ...previous,
      draft: { ...previous.draft, ...patch },
      errors: {},
      error: null,
    }));
  const save = async (changes: UpdateFinancialAccountInput["changes"]) => {
    if (inFlight.current || blocked || reconciled || state.uncertain) return;
    const parsed = updateFinancialAccountInputSchema.safeParse({
      financialAccountId: original.current.id,
      expectedUpdatedAt: original.current.updatedAt,
      changes,
    });
    if (!parsed.success) {
      setState((previous) => ({
        ...previous,
        errors: accountErrors(parsed.error.issues),
        error: "Check the marked fields.",
      }));
      return;
    }
    const submitted = parsed.data;
    request.current = submitted;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, errors: {} }));
    try {
      await props.runMutation(async () => {
        const result = await callFinanceOperation("update_financial_account", submitted);
        if (
          result.financialAccount.id !== submitted.financialAccountId ||
          !accountMatchesChanges(result.financialAccount, submitted.changes)
        ) {
          throw new FinanceClientError(
            "DEPENDENCY_UNAVAILABLE",
            "The account update could not be verified. Refresh your records.",
            null,
            true,
          );
        }
        return result;
      });
      onClose();
    } catch (error) {
      const known = error instanceof FinanceClientError;
      const uncertain = !known || error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        conflict: known && error.code === "CONFLICT",
        error: known
          ? error.message
          : "The account update could not be verified. Refresh your records.",
        errors: known ? accountErrorsFromFields(error.fieldErrors) : previous.errors,
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.mode === "edit" && !unchanged) void save(values);
  };
  const setMode = (mode: AccountEditorState["mode"]) =>
    setState((previous) => ({ ...previous, mode, error: null }));
  return {
    active,
    blocked,
    change,
    close,
    locked,
    name: original.current.name,
    onRefreshRecords: props.onRefreshRecords,
    reconciled,
    save,
    setMode,
    state,
    submit,
    unchanged,
    versionChanged,
  };
}

type LiveAccountEditor = ReturnType<typeof useAccountEditor>;

function AccountStatusFields({ editor }: { editor: LiveAccountEditor }) {
  const { active, blocked, onRefreshRecords, save, setMode, state } = editor;
  return (
    <>
      <p className="text-sm leading-6 text-muted">
        {active
          ? "This account will no longer be available for new transactions. Existing transaction history stays linked to it."
          : "This account will become available for new transactions again."}
      </p>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {(blocked || state.uncertain) && (
        <FinanceRecovery
          message="Check your records before retrying this account change."
          onRefreshRecords={onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button
          className="min-h-11"
          isDisabled={state.pending}
          onPress={() => setMode("edit")}
          variant="secondary"
        >
          Back
        </Button>
        <Button
          className="min-h-11"
          isDisabled={state.pending || state.uncertain || blocked}
          onPress={() => void save({ isActive: !active })}
          variant={active ? "danger" : "primary"}
        >
          {state.pending ? "Saving…" : active ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
    </>
  );
}

function AccountEditFields({ editor }: { editor: LiveAccountEditor }) {
  const {
    active,
    blocked,
    change,
    close,
    locked,
    onRefreshRecords,
    setMode,
    state,
    unchanged,
    versionChanged,
  } = editor;
  return (
    <>
      <AccountFields
        disabled={locked}
        draft={state.draft}
        errors={state.errors}
        onChange={change}
      />
      <div className="rounded-2xl border border-separator p-3">
        <p className="text-sm font-semibold">Account status</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {active
            ? "Active accounts are available for new transactions."
            : "Inactive accounts stay in your history but cannot be used for new transactions."}
        </p>
        <Button
          className={`mt-2 min-h-11 rounded-full ${active ? "text-danger" : ""}`}
          isDisabled={locked}
          onPress={() => setMode("status")}
          variant="ghost"
        >
          {active ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {versionChanged || state.conflict ? (
        <p className={styles.meta} role="status">
          This account changed while you were editing. Refresh, then reopen it.
        </p>
      ) : null}
      {(blocked || state.uncertain) && (
        <FinanceRecovery
          message="Check your records before retrying. A retry keeps the same reviewed account version."
          onRefreshRecords={onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button className="min-h-11" isDisabled={state.pending} onPress={close} variant="secondary">
          Cancel
        </Button>
        <Button
          className="min-h-11"
          isDisabled={state.pending || state.uncertain || blocked || unchanged}
          type="submit"
        >
          {state.pending ? "Saving…" : state.uncertain ? "Retry same change" : "Save account"}
        </Button>
      </div>
    </>
  );
}

function AccountEditorContent({ editor }: { editor: LiveAccountEditor }) {
  if (editor.reconciled) {
    return (
      <>
        <p className="text-sm leading-6" role="status">
          The updated account now appears in your records.
        </p>
        <Button className="min-h-11" onPress={editor.close}>
          Done
        </Button>
      </>
    );
  }
  if (editor.state.mode === "status") return <AccountStatusFields editor={editor} />;
  return <AccountEditFields editor={editor} />;
}

function AccountEditor(props: AccountEditorProps) {
  const editor = useAccountEditor(props);
  const title =
    editor.state.mode === "edit"
      ? "Edit account"
      : editor.active
        ? `Deactivate ${editor.name}?`
        : `Reactivate ${editor.name}?`;
  return (
    <ModalDialog labelledBy="account-editor-title" onClose={editor.close}>
      <form
        aria-busy={editor.state.pending}
        className={styles.form}
        noValidate
        onSubmit={editor.submit}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" id="account-editor-title">
            {title}
          </h2>
          <Button
            aria-label="Close account editor"
            isDisabled={editor.state.pending}
            isIconOnly
            onPress={editor.close}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <AccountEditorContent editor={editor} />
      </form>
    </ModalDialog>
  );
}

export function FinancialAccountSetup({
  allowAdditional = false,
  ...props
}: FinanceManagerProps & { allowAdditional?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const titleId = useId();
  const accounts = props.snapshot.financialAccounts;
  const selected = accounts.find((account) => account.id === selectedId);
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
                  {!account.isActive ? " · Inactive" : ""}
                </p>
              </div>
              <Button
                aria-label={`Edit ${account.name}`}
                className="min-h-11 shrink-0 rounded-full px-4"
                isDisabled={Boolean(props.refreshRequired)}
                onPress={() => setSelectedId(account.id)}
                variant="secondary"
              >
                Edit
              </Button>
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
      {selected ? (
        <AccountEditor
          {...props}
          account={selected}
          key={selected.id}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </section>
  );
}

type DemoAccountEditorProps = {
  account: FinancialAccount;
  onUpdate: (accountId: string, changes: DemoAccountChanges) => void;
  onClose: () => void;
};

function useDemoAccountEditor({ account, onUpdate, onClose }: DemoAccountEditorProps) {
  const [state, setState] = useState({
    draft: draftOf(account),
    errors: {} as AccountErrors,
    mode: "edit" as "edit" | "status",
    error: null as string | null,
  });
  const values = accountChanges(state.draft);
  const unchanged = accountMatchesChanges(account, values);
  const change = (patch: Partial<AccountDraft>) =>
    setState((previous) => ({
      ...previous,
      draft: { ...previous.draft, ...patch },
      errors: {},
      error: null,
    }));
  const update = (changes: DemoAccountChanges) => {
    try {
      onUpdate(account.id, changes);
      onClose();
    } catch (failure) {
      setState((previous) => ({
        ...previous,
        error: failure instanceof Error ? failure.message : "Check the account details.",
      }));
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.mode !== "edit" || unchanged) return;
    const parsed = updateFinancialAccountInputSchema.safeParse({
      financialAccountId: account.id,
      expectedUpdatedAt: account.updatedAt,
      changes: values,
    });
    if (!parsed.success) {
      setState((previous) => ({
        ...previous,
        errors: accountErrors(parsed.error.issues),
        error: "Check the marked fields.",
      }));
      return;
    }
    update(parsed.data.changes);
  };
  const setMode = (mode: "edit" | "status") =>
    setState((previous) => ({ ...previous, mode, error: null }));
  return { account, change, onClose, setMode, state, submit, unchanged, update };
}

type DemoAccountEditorState = ReturnType<typeof useDemoAccountEditor>;

function DemoAccountStatusFields({ editor }: { editor: DemoAccountEditorState }) {
  const { account, setMode, state, update } = editor;
  return (
    <>
      <p className="text-sm leading-6 text-muted">
        {account.isActive
          ? "This account will no longer be available for new transactions. Existing transaction history stays linked to it."
          : "This account will become available for new transactions again."}
      </p>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <p className={styles.meta}>Changes last for this demo visit.</p>
      <div className={styles.footer}>
        <Button className="min-h-11" onPress={() => setMode("edit")} variant="secondary">
          Back
        </Button>
        <Button
          className="min-h-11"
          onPress={() => update({ isActive: !account.isActive })}
          variant={account.isActive ? "danger" : "primary"}
        >
          {account.isActive ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
    </>
  );
}

function DemoAccountEditFields({ editor }: { editor: DemoAccountEditorState }) {
  const { account, change, onClose, setMode, state, unchanged } = editor;
  return (
    <>
      <AccountFields disabled={false} draft={state.draft} errors={state.errors} onChange={change} />
      <div className="rounded-2xl border border-separator p-3">
        <p className="text-sm font-semibold">Account status</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {account.isActive
            ? "Active accounts are available for new transactions."
            : "Inactive accounts stay in your history but cannot be used for new transactions."}
        </p>
        <Button
          className={`mt-2 min-h-11 rounded-full ${account.isActive ? "text-danger" : ""}`}
          onPress={() => setMode("status")}
          variant="ghost"
        >
          {account.isActive ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <p className={styles.meta}>Changes last for this demo visit.</p>
      <div className={styles.footer}>
        <Button className="min-h-11" onPress={onClose} variant="secondary">
          Cancel
        </Button>
        <Button className="min-h-11" isDisabled={unchanged} type="submit">
          Save account
        </Button>
      </div>
    </>
  );
}

function DemoAccountEditor({ account, onUpdate, onClose }: DemoAccountEditorProps) {
  const editor = useDemoAccountEditor({ account, onUpdate, onClose });
  const status = editor.state.mode === "status";
  const title = status
    ? account.isActive
      ? `Deactivate ${account.name}?`
      : `Reactivate ${account.name}?`
    : "Edit account";
  return (
    <ModalDialog labelledBy="demo-account-editor-title" onClose={onClose}>
      <form className={styles.form} noValidate onSubmit={editor.submit}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" id="demo-account-editor-title">
            {title}
          </h2>
          <Button aria-label="Close account editor" isIconOnly onPress={onClose} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        {status ? (
          <DemoAccountStatusFields editor={editor} />
        ) : (
          <DemoAccountEditFields editor={editor} />
        )}
      </form>
    </ModalDialog>
  );
}

export function DemoFinancialAccountSetup({
  accounts,
  onCreate,
  onUpdate,
}: {
  accounts: FinancialAccount[];
  onCreate: (input: Omit<CreateFinancialAccountInput, "clientRequestId">) => void;
  onUpdate: (accountId: string, changes: DemoAccountChanges) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(() => draftOf());
  const [error, setError] = useState<string | null>(null);
  const selected = accounts.find((account) => account.id === selectedId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onCreate(accountValues(draft));
      setOpen(false);
      setDraft(draftOf());
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
                {!account.isActive ? " · Inactive" : ""}
              </p>
            </div>
            <Button
              aria-label={`Edit ${account.name}`}
              className="min-h-11 shrink-0 rounded-full px-4"
              onPress={() => setSelectedId(account.id)}
              variant="secondary"
            >
              Edit
            </Button>
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
      {selected ? (
        <DemoAccountEditor
          account={selected}
          key={selected.id}
          onClose={() => setSelectedId(null)}
          onUpdate={onUpdate}
        />
      ) : null}
    </section>
  );
}

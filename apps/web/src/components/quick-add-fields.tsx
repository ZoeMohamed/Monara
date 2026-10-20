"use client";

import type { FinancialAccount } from "@monara/contracts";
import { Button } from "@monara/ui";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { AccountBadge } from "@/components/account-badge";
import { BrandMark } from "@/components/brand-mark";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon, type IconName } from "@/components/icon";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { formatDay } from "@/data/demo-ledger";

type Kind = "expense" | "income" | "exclusion";

export type QuickAddDraft = {
  merchant: string;
  amount: string;
  date: string;
  kind: Kind | null;
  category: string | null;
  method: string | null;
};

export type QuickAddChoice = {
  id: string;
  label: string;
  icon?: string;
  /** The account behind an account chip, so its bank logo or type icon can lead the label. */
  account?: Pick<FinancialAccount, "name" | "institution" | "accountType">;
};

type QuickAddErrors = Partial<
  Record<"merchant" | "amount" | "date" | "method" | "category", string>
>;

const kinds: { id: Kind; label: string; icon: IconName }[] = [
  { id: "expense", label: "Expense", icon: "trend-up" },
  { id: "income", label: "Income", icon: "income" },
  { id: "exclusion", label: "Exclusion", icon: "transfer" },
];

const MAX_DIGITS = 15;

/** Digits only, no leading zeros, so the stored draft is what the finance parser expects. */
function amountDigits(input: string) {
  return input.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
}

function groupedAmount(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function shiftDate(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

const chip =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60";
const chipOff = "border-border bg-surface text-foreground";
const chipOn = "border-accent bg-accent-soft text-accent";

function Group({
  label,
  field,
  error,
  children,
}: {
  label: string;
  field: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="min-w-0" data-field={field}>
      <legend className="mb-2 text-xs font-semibold text-muted">{label}</legend>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** One scrolling row of choices, so a long list costs one line instead of a dropdown. */
function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function KindSwitch({
  kind,
  disabled,
  onKind,
}: {
  kind: Kind | null;
  disabled: boolean;
  onKind: (label: string) => void;
}) {
  return (
    <fieldset
      aria-label="Type"
      className="flex gap-1 rounded-2xl bg-surface-secondary p-1"
      data-field="kind"
    >
      {kinds.map((item) => (
        <button
          aria-pressed={kind === item.id}
          className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-colors disabled:opacity-60 ${
            kind === item.id ? "bg-surface text-foreground shadow-sm" : "text-muted"
          }`}
          disabled={disabled}
          key={item.id}
          onClick={() => onKind(item.label)}
          // Switching type should not drop the amount field's focus or close the keypad.
          onPointerDown={(event) => event.preventDefault()}
          type="button"
        >
          <Icon aria-hidden className="h-4 w-4 shrink-0" name={item.icon} />
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}

function AmountField({
  value,
  error,
  disabled,
  onChange,
}: {
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (digits: string) => void;
}) {
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  // The amount comes first, so the keypad is ready the moment the sheet opens.
  useEffect(() => input.current?.focus(), []);
  return (
    <div>
      <label className="flex items-baseline gap-2">
        <span aria-hidden className="text-xl font-bold text-muted">
          Rp
        </span>
        <span className="sr-only">Amount in rupiah</span>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-4xl! font-extrabold tracking-tight leading-tight! text-foreground outline-none placeholder:text-muted/50 disabled:opacity-60"
          disabled={disabled}
          enterKeyHint="next"
          inputMode="numeric"
          ref={input}
          name="amount"
          onChange={(event) => onChange(amountDigits(event.target.value))}
          placeholder="0"
          value={groupedAmount(value)}
        />
      </label>
      {error ? (
        <p className="mt-1 text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MerchantField({
  kind,
  value,
  error,
  disabled,
  onChange,
}: {
  kind: Kind | null;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (merchant: string) => void;
}) {
  const errorId = useId();
  const logo = useMerchantLogo(value);
  const income = kind === "income";
  return (
    <div>
      <label
        className={`flex min-h-12 items-center gap-3 rounded-2xl border bg-surface px-3 ${
          error ? "border-danger" : "border-border focus-within:border-accent"
        }`}
      >
        {logo ? (
          <BrandMark brand={logo} size={28} />
        ) : (
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted"
          >
            <Icon className="h-4 w-4" name={income ? "income" : "store"} />
          </span>
        )}
        <span className="sr-only">{income ? "Income source" : "Merchant"}</span>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="min-h-11 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted disabled:opacity-60"
          disabled={disabled}
          enterKeyHint="done"
          name="merchant"
          onChange={(event) => onChange(event.target.value)}
          placeholder={income ? "From, e.g. Monthly salary" : "Where, e.g. Starbucks"}
          value={value}
        />
      </label>
      {error ? (
        <p className="mt-1.5 text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DateChips({
  date,
  today,
  error,
  disabled,
  onChange,
}: {
  date: string;
  today: string;
  error?: string;
  disabled: boolean;
  onChange: (date: string) => void;
}) {
  const yesterday = shiftDate(today, -1);
  const custom = date !== today && date !== yesterday;
  return (
    <Group error={error} field="date" label="Date">
      <div className="flex gap-2">
        {[
          { id: today, label: "Today" },
          { id: yesterday, label: "Yesterday" },
        ].map((item) => (
          <button
            aria-pressed={date === item.id}
            className={`${chip} ${date === item.id ? chipOn : chipOff}`}
            disabled={disabled}
            key={item.id}
            onClick={() => onChange(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
        {/* The native picker sits invisibly over the chip, so a tap opens the phone's own calendar. */}
        <label className={`${chip} relative ${custom ? chipOn : chipOff}`}>
          <Icon aria-hidden className="h-4 w-4" name="calendar" />
          {custom && date ? formatDay(date) : "Pick date"}
          <input
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            disabled={disabled}
            name="date"
            onChange={(event) => onChange(event.target.value)}
            type="date"
            value={date}
          />
        </label>
      </div>
    </Group>
  );
}

export function QuickAddFields({
  draft,
  errors,
  disabled,
  today,
  accounts,
  categories,
  onChange,
  onClose,
  closeDisabled,
  onKind,
}: {
  draft: QuickAddDraft;
  errors: QuickAddErrors;
  disabled: boolean;
  today: string;
  accounts: QuickAddChoice[];
  categories: QuickAddChoice[];
  onChange: (patch: Partial<QuickAddDraft>) => void;
  onKind: (label: string) => void;
  onClose: () => void;
  closeDisabled: boolean;
}) {
  const exclusion = draft.kind === "exclusion";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <KindSwitch disabled={disabled} kind={draft.kind} onKind={onKind} />
        </div>
        <Button
          aria-label="Close transaction form"
          isDisabled={closeDisabled}
          isIconOnly
          onPress={onClose}
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      </div>
      <AmountField
        disabled={disabled}
        error={errors.amount}
        onChange={(amount) => onChange({ amount })}
        value={draft.amount}
      />
      <MerchantField
        disabled={disabled}
        error={errors.merchant}
        kind={draft.kind}
        onChange={(merchant) => onChange({ merchant })}
        value={draft.merchant}
      />
      <Group error={errors.method} field="method" label="Account">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">Add an account in your profile first.</p>
        ) : (
          <ChipRow>
            {accounts.map((account) => (
              <button
                aria-pressed={draft.method === account.id}
                className={`${chip} ${draft.method === account.id ? chipOn : chipOff}`}
                disabled={disabled}
                key={account.id}
                onClick={() => onChange({ method: account.id })}
                type="button"
              >
                <AccountBadge account={account.account} name={account.label} size={22} />
                {account.label}
              </button>
            ))}
          </ChipRow>
        )}
      </Group>
      {categories.length > 0 ? (
        <Group
          error={errors.category}
          field="category"
          label={exclusion ? "Reason (optional)" : "Category (optional)"}
        >
          <ChipRow>
            {categories.map((category) => {
              const selected = draft.category === category.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`${chip} ${selected ? chipOn : chipOff}`}
                  disabled={disabled}
                  key={category.id}
                  onClick={() => onChange({ category: selected ? null : category.id })}
                  type="button"
                >
                  <CategoryAvatar
                    className="grid h-5 w-5 shrink-0 place-items-center"
                    icon={category.icon}
                    iconClassName="h-4 w-4"
                    name={category.label}
                    size={20}
                  />
                  {category.label}
                </button>
              );
            })}
          </ChipRow>
        </Group>
      ) : null}
      <DateChips
        date={draft.date}
        disabled={disabled}
        error={errors.date}
        onChange={(date) => onChange({ date })}
        today={today}
      />
      {exclusion ? (
        <p className="rounded-xl bg-surface-secondary px-3 py-2 text-xs leading-5 text-muted">
          Kept in your history. This amount stays out of spending, income, and budgets.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { calendarDateSchema } from "@monara/contracts";
import { Button, FieldError, Input, Label, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { type Budget, formatDay, type Transaction } from "@/data/demo-ledger";
import { parseDraftAmount } from "@/lib/finance/presentation";

export type DemoBudgetChanges = { limit: number; startsOn: string; warningPercent: number };

export function DemoBudgetEditor({
  budget,
  today,
  transactions,
  onSave,
  onClose,
}: {
  budget: Budget;
  today: string;
  transactions: Transaction[];
  onSave: (budgetId: string, changes: DemoBudgetChanges) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    limit: String(budget.limit),
    startsOn: budget.startsOn ?? `${today.slice(0, 7)}-01`,
    warningPercent: String(budget.warningPercent),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({});
  const incomeDate = transactions
    .filter(
      (transaction) =>
        transaction.kind === "income" &&
        transaction.status === "confirmed" &&
        transaction.date !== null &&
        transaction.date <= today,
    )
    .map((transaction) => transaction.date)
    .sort()
    .at(-1);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    let limit: number | null = null;
    try {
      limit = parseDraftAmount(draft.limit);
    } catch {
      nextErrors.limit = "Enter a positive whole amount of rupiah.";
    }
    if (limit === null || limit <= 0) nextErrors.limit = "Enter a positive whole amount of rupiah.";
    if (!calendarDateSchema.safeParse(draft.startsOn).success)
      nextErrors.startsOn = "Choose a valid start date.";
    const warningPercent = Number(draft.warningPercent);
    if (!/^\d+$/.test(draft.warningPercent) || warningPercent < 1 || warningPercent > 100)
      nextErrors.warningPercent = "Enter a percentage from 1 to 100.";
    if (Object.keys(nextErrors).length > 0 || limit === null) {
      setErrors(nextErrors);
      return;
    }
    onSave(budget.id, { limit, startsOn: draft.startsOn, warningPercent });
    onClose();
  };
  return (
    <ModalDialog labelledBy="demo-budget-title" onClose={onClose}>
      <form className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.header}>
          <h2 className="text-xl font-bold" id="demo-budget-title">
            Edit {budget.category} budget
          </h2>
          <Button aria-label="Close budget form" isIconOnly onPress={onClose} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        <TextField
          isInvalid={Boolean(errors.limit)}
          name="limit"
          onChange={(limit) => setDraft((previous) => ({ ...previous, limit }))}
          value={draft.limit}
        >
          <Label>Monthly limit in rupiah</Label>
          <Input autoFocus className="min-h-11 text-base" inputMode="numeric" maxLength={16} />
          <FieldError>{errors.limit}</FieldError>
        </TextField>
        <TextField
          isInvalid={Boolean(errors.startsOn)}
          name="startsOn"
          onChange={(startsOn) => setDraft((previous) => ({ ...previous, startsOn }))}
          type="date"
          value={draft.startsOn}
        >
          <Label>Period starts on</Label>
          <Input className="min-h-11 text-base" />
          <FieldError>{errors.startsOn}</FieldError>
        </TextField>
        <p className={styles.meta}>
          Resets on this day each month. Shorter months use their last day. Choose your payday or
          any date that works for you.
        </p>
        {incomeDate && (
          <Button
            className="min-h-11 justify-start rounded-full text-xs"
            onPress={() => setDraft((previous) => ({ ...previous, startsOn: incomeDate }))}
            variant="secondary"
          >
            <Icon className="h-4 w-4" name="income" />
            Use last income · {formatDay(incomeDate)}
          </Button>
        )}
        <TextField
          isInvalid={Boolean(errors.warningPercent)}
          name="warningPercent"
          onChange={(warningPercent) => setDraft((previous) => ({ ...previous, warningPercent }))}
          value={draft.warningPercent}
        >
          <Label>Notify me at (%)</Label>
          <Input className="min-h-11 text-base" inputMode="numeric" maxLength={3} />
          <FieldError>{errors.warningPercent}</FieldError>
        </TextField>
        <p className={styles.meta}>Changes last for this demo visit.</p>
        <div className={styles.footer}>
          <Button className="min-h-11" onPress={onClose} variant="secondary">
            Cancel
          </Button>
          <Button className="min-h-11" type="submit">
            Save budget
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

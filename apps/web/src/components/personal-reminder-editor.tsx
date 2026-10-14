"use client";

import { Button, FieldError, Input, Label, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import {
  type PersonalReminder,
  type PersonalReminderDraft,
  personalReminderErrors,
} from "@/data/personal-reminders";
import { parseDraftAmount } from "@/lib/finance/presentation";

const kinds = [
  { id: "payment", title: "Payment", icon: "bills" },
  { id: "birthday", title: "Birthday", icon: "heart" },
  { id: "other", title: "Other", icon: "bell" },
] as const;

export function PersonalReminderEditor({
  reminder,
  today,
  onSave,
  onCancel,
}: {
  reminder?: PersonalReminder;
  today: string;
  onSave: (draft: PersonalReminderDraft, id?: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    title: reminder?.title ?? "",
    kind: reminder?.kind ?? "payment",
    dueOn: reminder?.dueOn ?? today,
    amount:
      reminder?.amount === undefined || reminder.amount === null ? "" : String(reminder.amount),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PersonalReminderDraft, string>>>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let amount: number | null = null;
    try {
      amount = draft.kind === "payment" ? parseDraftAmount(draft.amount) : null;
    } catch {
      setErrors({ amount: "Enter a positive whole amount of rupiah, or leave it empty." });
      return;
    }
    const values = { ...draft, title: draft.title.trim(), amount };
    const nextErrors = personalReminderErrors(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(values, reminder?.id);
    onCancel();
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={submit}>
      <h3 className="text-lg font-bold">{reminder ? "Edit reminder" : "New reminder"}</h3>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What are you remembering?</legend>
        <div className="flex gap-2">
          {kinds.map((kind) => (
            <Button
              aria-pressed={draft.kind === kind.id}
              className="min-h-11 min-w-0 flex-1 rounded-xl px-2 text-xs"
              key={kind.id}
              onPress={() => setDraft((previous) => ({ ...previous, kind: kind.id }))}
              variant={draft.kind === kind.id ? "primary" : "secondary"}
            >
              <Icon className="h-4 w-4" name={kind.icon} />
              {kind.title}
            </Button>
          ))}
        </div>
      </fieldset>
      <TextField
        isInvalid={Boolean(errors.title)}
        name="title"
        onChange={(title) => setDraft((previous) => ({ ...previous, title }))}
        value={draft.title}
      >
        <Label>Reminder name</Label>
        <Input
          autoFocus
          className="min-h-11 text-base"
          maxLength={100}
          placeholder="e.g. Pay rent"
        />
        <FieldError>{errors.title}</FieldError>
      </TextField>
      <TextField
        isInvalid={Boolean(errors.dueOn)}
        name="dueOn"
        onChange={(dueOn) => setDraft((previous) => ({ ...previous, dueOn }))}
        type="date"
        value={draft.dueOn}
      >
        <Label>Due date</Label>
        <Input className="min-h-11 text-base" />
        <FieldError>{errors.dueOn}</FieldError>
      </TextField>
      {draft.kind === "payment" && (
        <TextField
          isInvalid={Boolean(errors.amount)}
          name="amount"
          onChange={(amount) => setDraft((previous) => ({ ...previous, amount }))}
          value={draft.amount}
        >
          <Label>Amount in rupiah (optional)</Label>
          <Input
            className="min-h-11 text-base"
            inputMode="numeric"
            maxLength={16}
            placeholder="Leave empty if you’re unsure"
          />
          <FieldError>{errors.amount}</FieldError>
        </TextField>
      )}
      <p className={styles.meta}>
        For this demo visit. This reminder won’t send a notification outside Monara.
      </p>
      <div className={styles.footer}>
        <Button className="min-h-11" onPress={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button className="min-h-11" type="submit">
          Save reminder
        </Button>
      </div>
    </form>
  );
}

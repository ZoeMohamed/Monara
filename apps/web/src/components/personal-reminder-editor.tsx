"use client";

import { Button, FieldError, Input, Label, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";
import styles from "@/components/reminders-center.module.css";
import {
  type PersonalReminder,
  type PersonalReminderDraft,
  personalReminderErrors,
} from "@/data/personal-reminders";
import { parseDraftAmount } from "@/lib/finance/presentation";

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
    tag: reminder?.tag ?? "",
    dueOn: reminder?.dueOn ?? today,
    amount:
      reminder?.amount === undefined || reminder.amount === null ? "" : String(reminder.amount),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PersonalReminderDraft, string>>>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let amount: number | null = null;
    try {
      amount = parseDraftAmount(draft.amount);
    } catch {
      setErrors({ amount: "Enter a positive whole amount of rupiah, or leave it empty." });
      return;
    }
    const values = { ...draft, title: draft.title.trim(), tag: draft.tag.trim() || null, amount };
    const nextErrors = personalReminderErrors(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(values, reminder?.id);
    onCancel();
  };
  return (
    <form className={styles.editor} noValidate onSubmit={submit}>
      <h3 className="text-lg font-bold">{reminder ? "Edit reminder" : "New reminder"}</h3>
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
        isInvalid={Boolean(errors.tag)}
        name="tag"
        onChange={(tag) => setDraft((previous) => ({ ...previous, tag }))}
        value={draft.tag}
      >
        <Label>Tag (optional)</Label>
        <Input className="min-h-11 text-base" maxLength={32} placeholder="Your own label" />
        <FieldError>{errors.tag}</FieldError>
      </TextField>
      <div className={styles.formColumns}>
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
            placeholder="Leave empty if unknown"
          />
          <FieldError>{errors.amount}</FieldError>
        </TextField>
      </div>
      <p className={styles.scope}>Demo visit only · no scheduled delivery</p>
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

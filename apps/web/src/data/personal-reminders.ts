import { calendarDateSchema } from "@monara/contracts";

export type PersonalReminder = {
  id: string;
  title: string;
  tag: string | null;
  dueOn: string;
  amount: number | null;
  completedAt: string | null;
};

export type PersonalReminderDraft = Omit<PersonalReminder, "id" | "completedAt">;

/** Demo reminders are intentionally held in browser memory, never presented as delivered. */
export function personalReminderErrors(
  draft: PersonalReminderDraft,
): Partial<Record<keyof PersonalReminderDraft, string>> {
  const errors: Partial<Record<keyof PersonalReminderDraft, string>> = {};
  if (draft.title.trim().length === 0 || draft.title.trim().length > 100)
    errors.title = "Enter a reminder name, up to 100 characters.";
  if (!calendarDateSchema.safeParse(draft.dueOn).success) errors.dueOn = "Choose a valid due date.";
  if (draft.tag !== null && (draft.tag.trim().length === 0 || draft.tag.trim().length > 32))
    errors.tag = "Use a tag up to 32 characters, or leave it empty.";
  if (draft.amount !== null && (!Number.isSafeInteger(draft.amount) || draft.amount <= 0))
    errors.amount = "Enter a positive whole amount of rupiah, or leave it empty.";
  return errors;
}

export function duePersonalReminders(reminders: PersonalReminder[], today: string): number {
  return reminders.filter((reminder) => reminder.completedAt === null && reminder.dueOn <= today)
    .length;
}

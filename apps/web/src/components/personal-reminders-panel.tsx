"use client";

import { Button, Chip } from "@monara/ui";
import { useState } from "react";
import { useAppSession } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import { PersonalReminderEditor } from "@/components/personal-reminder-editor";
import styles from "@/components/reminders-center.module.css";
import { daysBetween, formatDay, formatRupiah } from "@/data/demo-ledger";
import type { PersonalReminder } from "@/data/personal-reminders";

const personalIcons = { payment: "bills", birthday: "heart", other: "bell" } as const;

function dueReminderLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${days === -1 ? "day" : "days"} overdue`;
  if (days === 0) return "Today";
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

function ReminderTiming({ reminder, today }: { reminder: PersonalReminder; today: string }) {
  if (reminder.completedAt !== null)
    return (
      <p className={styles.receipt}>
        <Icon className="h-3.5 w-3.5" name="check" />
        Done {formatDay(reminder.completedAt.slice(0, 10))}
      </p>
    );
  const days = daysBetween(today, reminder.dueOn);
  if (days > 3) return null;
  return (
    <Chip className="mt-2" color={days < 0 ? "danger" : "warning"} size="sm" variant="soft">
      {dueReminderLabel(days)}
    </Chip>
  );
}

function PersonalReminderRow({
  reminder,
  today,
  onEdit,
  onSetDone,
}: {
  reminder: PersonalReminder;
  today: string;
  onEdit: () => void;
  onSetDone: (done: boolean) => void;
}) {
  const done = reminder.completedAt !== null;
  return (
    <li className={styles.item}>
      <span className={styles.symbol} data-personal="true">
        <Icon className="h-5 w-5" name={done ? "check" : personalIcons[reminder.kind]} />
      </span>
      <div className={styles.content}>
        <h4 className={styles.title}>{reminder.title}</h4>
        <p className={styles.meta}>
          {formatDay(reminder.dueOn)}
          {reminder.amount === null ? "" : ` · ${formatRupiah(reminder.amount)}`}
        </p>
        <ReminderTiming reminder={reminder} today={today} />
        <div className={styles.actions}>
          <Button
            aria-label={`${done ? "Reopen" : "Mark done:"} ${reminder.title}`}
            className="min-h-11 rounded-full px-3 text-xs"
            onPress={() => onSetDone(!done)}
            variant={done ? "ghost" : "secondary"}
          >
            {done ? (
              "Reopen"
            ) : (
              <>
                <Icon className="h-4 w-4" name="check" />
                Mark done
              </>
            )}
          </Button>
          <Button
            aria-label={`Edit ${reminder.title} reminder`}
            className="min-h-11 rounded-full px-3 text-xs"
            onPress={onEdit}
            variant="ghost"
          >
            Edit
          </Button>
        </div>
      </div>
    </li>
  );
}

function PersonalRemindersEmpty({
  view,
  onCreate,
}: {
  view: "todo" | "done";
  onCreate: () => void;
}) {
  const done = view === "done";
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={done ? "check" : "calendar"} />
      </span>
      <h4 className="text-sm font-bold">
        {done ? "Completed reminders appear here" : "Make room for one less thing to remember"}
      </h4>
      <p className={styles.meta}>
        {done
          ? "Mark a reminder done to keep a completion receipt."
          : "Set a date for rent, a birthday, or your next payment."}
      </p>
      {!done && (
        <Button className="mt-4 min-h-11 rounded-full" onPress={onCreate}>
          Create reminder
        </Button>
      )}
    </div>
  );
}

function LivePersonalReminders() {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name="calendar" />
      </span>
      <h4 className="text-sm font-bold">Personal reminders are coming</h4>
      <p className={styles.meta}>
        Creating and scheduling your own reminders is available in the demo. Your live notifications
        are in the next tab.
      </p>
    </div>
  );
}

export function PersonalRemindersPanel() {
  const session = useAppSession();
  const [view, setView] = useState<"todo" | "done">("todo");
  const [editor, setEditor] = useState<{ reminder?: PersonalReminder } | null>(null);
  const demo = session.dataMode === "demo";
  const filtered = session.personalReminders
    .filter((reminder) => (reminder.completedAt === null) === (view === "todo"))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const pending = session.personalReminders.filter(
    (reminder) => reminder.completedAt === null,
  ).length;
  if (editor)
    return (
      <PersonalReminderEditor
        key={editor.reminder?.id ?? "new"}
        onCancel={() => setEditor(null)}
        onSave={session.saveDemoReminder}
        reminder={editor.reminder}
        today={session.today}
      />
    );
  return (
    <section aria-labelledby="personal-reminders-title" className="grid gap-4">
      <div className={styles.header}>
        <div>
          <h3 className="text-base font-bold" id="personal-reminders-title">
            Your reminders
          </h3>
          <p className={styles.meta}>Payments, birthdays, and things you choose.</p>
        </div>
        {demo && (
          <Button
            aria-label="New personal reminder"
            className="min-h-11 rounded-full"
            isIconOnly
            onPress={() => setEditor({})}
            variant="secondary"
          >
            <Icon name="plus" />
          </Button>
        )}
      </div>
      {demo ? (
        <>
          <fieldset aria-label="Reminder status" className="flex gap-2">
            <Button
              aria-pressed={view === "todo"}
              className="min-h-11 rounded-full px-4 text-xs"
              onPress={() => setView("todo")}
              variant={view === "todo" ? "secondary" : "ghost"}
            >
              To do · {pending}
            </Button>
            <Button
              aria-pressed={view === "done"}
              className="min-h-11 rounded-full px-4 text-xs"
              onPress={() => setView("done")}
              variant={view === "done" ? "secondary" : "ghost"}
            >
              Done · {session.personalReminders.length - pending}
            </Button>
          </fieldset>
          {filtered.length > 0 ? (
            <ul className={styles.list}>
              {filtered.map((reminder) => (
                <PersonalReminderRow
                  key={reminder.id}
                  onEdit={() => setEditor({ reminder })}
                  onSetDone={(done) => session.setDemoReminderDone(reminder.id, done)}
                  reminder={reminder}
                  today={session.today}
                />
              ))}
            </ul>
          ) : (
            <PersonalRemindersEmpty onCreate={() => setEditor({})} view={view} />
          )}
          <p className="text-xs leading-5 text-muted">
            For this demo visit. Marking done records your acknowledgement; record payments in
            Transactions to update your finances.
          </p>
        </>
      ) : (
        <LivePersonalReminders />
      )}
    </section>
  );
}

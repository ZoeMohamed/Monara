"use client";

import { Button } from "@monara/ui";
import { useState } from "react";
import { useAppSession } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { NotificationsPanel } from "@/components/notifications-panel";
import { PersonalRemindersPanel } from "@/components/personal-reminders-panel";
import styles from "@/components/reminders-center.module.css";

export function RemindersCenter({ onClose }: { onClose: () => void }) {
  const session = useAppSession();
  const [tab, setTab] = useState<"reminders" | "notifications">(() =>
    session.personalReminders.some(
      (reminder) => reminder.completedAt === null && reminder.dueOn <= session.today,
    )
      ? "reminders"
      : "notifications",
  );
  const unread = session.updatesCount;
  const todo = session.personalReminders.filter((reminder) => reminder.completedAt === null).length;
  return (
    <ModalDialog labelledBy="reminders-center-title" onClose={onClose} size="lg">
      <div className={styles.sheet}>
        <div className={styles.header}>
          <h2 className="text-xl font-bold tracking-[-0.03em]" id="reminders-center-title">
            Notifications
          </h2>
          <Button
            aria-label="Close reminders and notifications"
            className="min-h-11 rounded-full"
            isIconOnly
            onPress={onClose}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <fieldset aria-label="Reminders and notifications" className={styles.tabs}>
          <Button
            aria-pressed={tab === "reminders"}
            className="min-h-11 min-w-0 flex-1 rounded-xl px-2 text-xs"
            onPress={() => setTab("reminders")}
            variant={tab === "reminders" ? "primary" : "ghost"}
          >
            <Icon className="h-4 w-4" name="calendar" />
            Reminders{todo > 0 ? ` · ${todo}` : ""}
          </Button>
          <Button
            aria-pressed={tab === "notifications"}
            className="min-h-11 min-w-0 flex-1 rounded-xl px-2 text-xs"
            onPress={() => setTab("notifications")}
            variant={tab === "notifications" ? "primary" : "ghost"}
          >
            <Icon className="h-4 w-4" name="bell" />
            Updates{unread > 0 ? ` · ${unread}` : ""}
          </Button>
        </fieldset>
        {tab === "reminders" ? <PersonalRemindersPanel /> : <NotificationsPanel />}
      </div>
    </ModalDialog>
  );
}

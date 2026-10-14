"use client";

import { Button, Chip } from "@monara/ui";
import { useEffect, useRef, useState } from "react";
import { useAppSession } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import styles from "@/components/reminders-center.module.css";
import { formatDay, type Reminder } from "@/data/demo-ledger";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import {
  completeNotificationPage,
  failNotificationPage,
  type NotificationPageRequest,
  type NotificationPageState,
} from "@/lib/finance/notification-paging";

async function loadNotificationPage(cursor?: string | null) {
  const page = await callFinanceOperation("list_reminders", { limit: 50, cursor });
  return {
    items: page.items.map(
      (reminder): Reminder => ({
        id: reminder.id,
        kind: reminder.kind === "budget_threshold" ? "budget" : "bill",
        title: reminder.title,
        message: reminder.message,
        scheduledFor: reminder.scheduledFor,
        status: reminder.status,
        backend: reminder,
      }),
    ),
    nextCursor: page.nextCursor,
  };
}

function useNotificationRecords(demo: boolean) {
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const [result, setResult] = useState<NotificationPageState | null>(null);
  const [pendingPage, setPendingPage] = useState<NotificationPageRequest | null>(null);
  const inFlight = useRef<NotificationPageRequest | null>(null);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void loadNotificationPage().then(
      (page) => {
        if (!cancelled && generation.current === attempt)
          setResult({ attempt, ...page, error: null });
      },
      (error: unknown) => {
        if (!cancelled && generation.current === attempt)
          setResult({
            attempt,
            items: [],
            nextCursor: null,
            error:
              error instanceof FinanceClientError
                ? error.message
                : "Notifications could not be loaded.",
          });
      },
    );
    return () => {
      cancelled = true;
      if (inFlight.current?.attempt === attempt) inFlight.current = null;
    };
  }, [demo, attempt]);
  const loaded = result?.attempt === attempt;
  const loadMore = async () => {
    if (!loaded || !result.nextCursor || inFlight.current || generation.current !== attempt) return;
    const request = { attempt, cursor: result.nextCursor };
    inFlight.current = request;
    setPendingPage(request);
    try {
      const page = await loadNotificationPage(request.cursor);
      setResult((previous) =>
        completeNotificationPage(previous, request, generation.current, page),
      );
    } catch (error) {
      setResult((previous) =>
        failNotificationPage(
          previous,
          request,
          generation.current,
          error instanceof FinanceClientError
            ? error.message
            : "More notifications could not be loaded.",
        ),
      );
    } finally {
      if (inFlight.current === request) {
        inFlight.current = null;
        setPendingPage((previous) => (previous === request ? null : previous));
      }
    }
  };
  const update = (item: Reminder) =>
    setResult((previous) =>
      previous && previous.attempt === attempt && generation.current === attempt
        ? {
            ...previous,
            items: previous.items.map((current) => (current.id === item.id ? item : current)),
          }
        : previous,
    );
  return {
    items: loaded ? result.items : [],
    error: loaded ? result.error : null,
    loading: !demo && !loaded,
    nextCursor: loaded ? result.nextCursor : null,
    loadingMore: pendingPage?.attempt === attempt,
    loadMore,
    update,
    retry: () => {
      generation.current += 1;
      inFlight.current = null;
      setPendingPage(null);
      setAttempt(generation.current);
    },
  };
}

function NotificationRow({
  reminder,
  disabled,
  pending,
  onChange,
}: {
  reminder: Reminder;
  disabled: boolean;
  pending: boolean;
  onChange: (status: "read" | "dismissed") => void;
}) {
  const unread = reminder.status === undefined || reminder.status === "unread";
  const readAt = reminder.backend?.readAt;
  return (
    <li className={styles.item} data-unread={unread}>
      <span className={styles.symbol}>
        <Icon className="h-5 w-5" name={reminder.kind === "budget" ? "budgets" : "bell"} />
      </span>
      <div className={styles.content}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className={styles.title}>
            {reminder.title ?? (reminder.kind === "budget" ? "Budget update" : "Bill due")}
          </h4>
          {unread && (
            <Chip color="accent" size="sm" variant="soft">
              New
            </Chip>
          )}
        </div>
        <p className={styles.message}>{reminder.message}</p>
        {!unread && (
          <p className={styles.receipt}>
            <Icon className="h-3.5 w-3.5" name="check" />
            {reminder.status === "dismissed"
              ? "Archived"
              : readAt
                ? `Read ${formatDay(readAt.slice(0, 10))}`
                : "Read for this demo visit"}
          </p>
        )}
        <div className={styles.actions}>
          {unread && (
            <Button
              aria-label={`Mark ${reminder.title ?? "notification"} read`}
              className="min-h-11 rounded-full px-3 text-xs"
              isDisabled={disabled}
              onPress={() => onChange("read")}
              variant="secondary"
            >
              {pending ? "Updating…" : "Mark read"}
            </Button>
          )}
          {reminder.status !== "dismissed" && (
            <Button
              aria-label={`Archive ${reminder.title ?? "notification"}`}
              className="min-h-11 rounded-full px-3 text-xs"
              isDisabled={disabled}
              onPress={() => onChange("dismissed")}
              variant="ghost"
            >
              Archive
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function useNotificationActions(records: ReturnType<typeof useNotificationRecords>, demo: boolean) {
  const session = useAppSession();
  const [state, setState] = useState({
    pending: null as string | null,
    error: null as string | null,
  });
  const inFlight = useRef(false);
  const change = async (reminder: Reminder, status: "read" | "dismissed") => {
    if (inFlight.current) return;
    if (demo) {
      session.setDemoNotificationStatus(reminder.id, status);
      return;
    }
    if (!reminder.backend || session.refreshRequired) return;
    inFlight.current = true;
    setState({ pending: reminder.id, error: null });
    try {
      const result = await session.runMutation(() =>
        status === "read"
          ? callFinanceOperation("mark_reminder_read", {
              reminderId: reminder.id,
              expectedStatus: reminder.backend?.status,
            })
          : callFinanceOperation("dismiss_reminder", {
              reminderId: reminder.id,
              expectedStatus: reminder.backend?.status,
            }),
      );
      records.update({ ...reminder, backend: result, status: result.status });
      setState({ pending: null, error: null });
    } catch (error) {
      setState({
        pending: null,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "The change could not be verified. Refresh notifications before trying again.",
      });
    } finally {
      inFlight.current = false;
    }
  };
  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ pending: "refresh", error: null });
    try {
      await session.refreshFinance();
      records.retry();
      setState({ pending: null, error: null });
    } catch {
      setState({ pending: null, error: "Notifications could not be refreshed. Please try again." });
    } finally {
      inFlight.current = false;
    }
  };
  const loadMore = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await records.loadMore();
    } finally {
      inFlight.current = false;
    }
  };
  return { state, change, refresh, loadMore };
}

function NotificationList({
  records,
  visible,
  archive,
  pending,
  disabled,
  onChange,
}: {
  records: ReturnType<typeof useNotificationRecords>;
  visible: Reminder[];
  archive: boolean;
  pending: string | null;
  disabled: boolean;
  onChange: (reminder: Reminder, status: "read" | "dismissed") => Promise<void>;
}) {
  if (records.loading)
    return (
      <p className={styles.meta} role="status">
        Loading notifications…
      </p>
    );
  if (visible.length > 0)
    return (
      <ul className={styles.list}>
        {visible.map((reminder) => (
          <NotificationRow
            disabled={disabled}
            key={reminder.id}
            onChange={(status) => {
              void onChange(reminder, status);
            }}
            pending={pending === reminder.id}
            reminder={reminder}
          />
        ))}
      </ul>
    );
  if (records.error) return null;
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name="check" />
      </span>
      <h4 className="text-sm font-bold">
        {archive ? "No archived notifications" : "You’re all caught up"}
      </h4>
      <p className={styles.meta}>
        {archive
          ? "Archived updates appear here."
          : "New budget and bill updates will appear here."}
      </p>
    </div>
  );
}

function NotificationRecovery({
  message,
  pending,
  disabled,
  onRefresh,
}: {
  message: string | null;
  pending: boolean;
  disabled: boolean;
  onRefresh: () => Promise<void>;
}) {
  if (!message) return null;
  return (
    <div role="alert">
      <p className="text-sm leading-6 text-danger">{message}</p>
      <Button
        className="mt-3 min-h-11 rounded-full"
        isDisabled={disabled}
        onPress={onRefresh}
        variant="secondary"
      >
        {pending ? "Refreshing…" : "Refresh notifications"}
      </Button>
    </div>
  );
}

export function NotificationsPanel() {
  const session = useAppSession();
  const demo = session.dataMode === "demo";
  const records = useNotificationRecords(demo);
  const actions = useNotificationActions(records, demo);
  const [archive, setArchive] = useState(false);
  const items = demo ? session.reminders : records.items;
  const visible = items.filter((reminder) => (reminder.status === "dismissed") === archive);
  const locked = actions.state.pending !== null || records.loadingMore;
  const recoveryRequired = !demo && session.refreshRequired;
  const recoveryMessage =
    actions.state.error ??
    records.error ??
    (recoveryRequired ? "Refresh your records before making another change." : null);
  return (
    <section aria-labelledby="app-notifications-title" className="grid gap-4">
      <div>
        <h3 className="text-base font-bold" id="app-notifications-title">
          From Monara
        </h3>
        <p className={styles.meta}>
          Budget updates and tracked bills. Reading a notification keeps the payment status
          unchanged.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          aria-pressed={!archive}
          className="min-h-11 rounded-full px-4 text-xs"
          onPress={() => setArchive(false)}
          variant={!archive ? "secondary" : "ghost"}
        >
          Updates
        </Button>
        <Button
          aria-pressed={archive}
          className="min-h-11 rounded-full px-4 text-xs"
          onPress={() => setArchive(true)}
          variant={archive ? "secondary" : "ghost"}
        >
          Archived
        </Button>
      </div>
      <NotificationList
        archive={archive}
        disabled={locked || recoveryRequired}
        onChange={actions.change}
        pending={actions.state.pending}
        records={records}
        visible={visible}
      />
      <NotificationRecovery
        disabled={locked}
        message={recoveryMessage}
        onRefresh={actions.refresh}
        pending={actions.state.pending === "refresh"}
      />
      {records.nextCursor && (
        <Button
          className="min-h-11 rounded-full"
          isDisabled={locked}
          onPress={actions.loadMore}
          variant="secondary"
        >
          {records.loadingMore ? "Loading…" : "Load more notifications"}
        </Button>
      )}
      {demo && (
        <p className="text-xs leading-5 text-muted">
          Read and archive states last for this demo visit.
        </p>
      )}
    </section>
  );
}

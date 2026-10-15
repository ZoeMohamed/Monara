import type { Reminder } from "../../data/demo-ledger.ts";

export type NotificationPage = { items: Reminder[]; nextCursor: string | null };
export type NotificationPageRequest = { attempt: number; cursor: string };
export type NotificationPageState = NotificationPage & { attempt: number; error: string | null };

function requestMatches(
  state: NotificationPageState | null,
  request: NotificationPageRequest,
  currentAttempt: number,
): state is NotificationPageState {
  return (
    state !== null &&
    currentAttempt === request.attempt &&
    state.attempt === request.attempt &&
    state.nextCursor === request.cursor
  );
}

/** Preserve current read receipts and reject pages from an obsolete list or cursor. */
export function completeNotificationPage(
  previous: NotificationPageState | null,
  request: NotificationPageRequest,
  currentAttempt: number,
  page: NotificationPage,
): NotificationPageState | null {
  if (!requestMatches(previous, request, currentAttempt)) return previous;
  return {
    ...previous,
    items: [
      ...previous.items,
      ...page.items.filter((item) => !previous.items.some((existing) => existing.id === item.id)),
    ],
    nextCursor: page.nextCursor,
    error: null,
  };
}

export function failNotificationPage(
  previous: NotificationPageState | null,
  request: NotificationPageRequest,
  currentAttempt: number,
  error: string,
): NotificationPageState | null {
  return requestMatches(previous, request, currentAttempt) ? { ...previous, error } : previous;
}

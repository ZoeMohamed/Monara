"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  type GmailConnectionsProps,
  GmailConnectionsScreen,
} from "@/components/gmail-connections-screen";
import {
  disconnectGmailConnection,
  GmailClientError,
  type GmailConnectionsState,
  type GmailMailbox,
  gmailConnectionsErrorState,
  loadGmailConnections,
  requestGmailSync,
  startGmailConnection,
  watchGmailSyncCounts,
} from "@/lib/gmail/client";

type ClientState = {
  view: GmailConnectionsState;
  pendingAction: GmailConnectionsProps["pendingAction"];
  actionError: string | undefined;
};

type ClientAction =
  | { type: "loading"; keepError?: boolean }
  | { type: "loaded"; mailboxes: GmailMailbox[] }
  | { type: "load-error"; error: unknown }
  | { type: "pending"; action: NonNullable<ClientState["pendingAction"]> }
  | { type: "action-finished" }
  | { type: "mailbox-metadata"; id: string; mailbox: GmailMailbox | undefined }
  | {
      type: "sync-state";
      id: string;
      change: Partial<GmailMailbox["sync"]>;
    }
  | { type: "action-error"; error: unknown };

function reducer(state: ClientState, action: ClientAction): ClientState {
  switch (action.type) {
    case "loading":
      return {
        view: { status: "loading" },
        pendingAction: undefined,
        actionError: action.keepError ? state.actionError : undefined,
      };
    case "loaded":
      return { ...state, view: { status: "ready", mailboxes: action.mailboxes } };
    case "load-error":
      return {
        view: gmailConnectionsErrorState(action.error),
        pendingAction: undefined,
        actionError: undefined,
      };
    case "pending":
      return { ...state, pendingAction: action.action, actionError: undefined };
    case "action-finished":
      return { ...state, pendingAction: undefined };
    case "mailbox-metadata":
      return {
        ...state,
        view:
          state.view.status === "ready"
            ? {
                ...state.view,
                mailboxes: state.view.mailboxes.flatMap((mailbox) => {
                  if (mailbox.id !== action.id) return [mailbox];
                  return action.mailbox ? [{ ...action.mailbox, sync: mailbox.sync }] : [];
                }),
              }
            : state.view,
      };
    case "sync-state":
      return {
        ...state,
        view:
          state.view.status === "ready"
            ? {
                ...state.view,
                mailboxes: state.view.mailboxes.map((mailbox) =>
                  mailbox.id === action.id
                    ? { ...mailbox, sync: { ...mailbox.sync, ...action.change } }
                    : mailbox,
                ),
              }
            : state.view,
      };
    case "action-error":
      return {
        view:
          action.error instanceof GmailClientError && action.error.status === "requires-sign-in"
            ? { status: "requires-sign-in" }
            : state.view,
        pendingAction: undefined,
        actionError:
          action.error instanceof GmailClientError && action.error.status === "requires-sign-in"
            ? undefined
            : action.error instanceof GmailClientError
              ? action.error.message
              : "The Gmail request could not be completed. Try again.",
      };
  }
}

export function GmailConnectionsClient({ callbackError }: { callbackError?: string }) {
  const [state, dispatch] = useReducer(reducer, {
    view: { status: "loading" },
    pendingAction: undefined,
    actionError: callbackError,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const actionPendingRef = useRef(false);
  const listVersion = useRef(0);
  const progressControllers = useRef(new Map<string, AbortController>());

  const stopProgress = useCallback((id?: string) => {
    for (const [mailboxId, controller] of progressControllers.current) {
      if (id === undefined || id === mailboxId) {
        controller.abort();
        progressControllers.current.delete(mailboxId);
      }
    }
  }, []);

  const watchProgress = useCallback(
    (id: string, change: Partial<GmailMailbox["sync"]> = {}, maxReads = 12) => {
      const pageSignal = controllerRef.current?.signal;
      if (!pageSignal || pageSignal.aborted) return;
      stopProgress(id);
      const controller = new AbortController();
      progressControllers.current.set(id, controller);
      const signal = AbortSignal.any([pageSignal, controller.signal]);
      dispatch({
        type: "sync-state",
        id,
        change: { ...change, state: "watching", message: undefined },
      });
      void watchGmailSyncCounts(id, {
        signal,
        maxReads,
        onCounts: (counts) => dispatch({ type: "sync-state", id, change: { counts } }),
      })
        .then(async () => {
          if (!signal.aborted) {
            dispatch({
              type: "sync-state",
              id,
              change: { state: maxReads === 1 ? "idle" : "paused" },
            });
          }
          if (signal.aborted || maxReads === 1) return;
          const mailboxes = await loadGmailConnections({ signal });
          if (!signal.aborted) {
            dispatch({
              type: "mailbox-metadata",
              id,
              mailbox: mailboxes.find((mailbox) => mailbox.id === id),
            });
          }
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          if (error instanceof GmailClientError && error.status === "requires-sign-in") {
            stopProgress();
            dispatch({ type: "action-error", error });
            return;
          }
          dispatch({
            type: "sync-state",
            id,
            change: {
              state: "error",
              message:
                error instanceof GmailClientError
                  ? error.message
                  : "Import counts could not be refreshed. Check progress again.",
            },
          });
        })
        .finally(() => {
          if (progressControllers.current.get(id) === controller)
            progressControllers.current.delete(id);
        });
    },
    [stopProgress],
  );

  const refresh = useCallback(
    async (keepError = false) => {
      const signal = controllerRef.current?.signal;
      if (!signal || signal.aborted || actionPendingRef.current) return;
      const version = ++listVersion.current;
      stopProgress();
      dispatch({ type: "loading", keepError });
      try {
        const mailboxes = await loadGmailConnections({ signal });
        if (signal.aborted || listVersion.current !== version) return;
        dispatch({ type: "loaded", mailboxes });
        for (const mailbox of mailboxes) watchProgress(mailbox.id, {}, 1);
      } catch (error) {
        if (!signal.aborted && listVersion.current === version)
          dispatch({ type: "load-error", error });
      }
    },
    [stopProgress, watchProgress],
  );

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      actionPendingRef.current = false;
      void refresh();
    };
    void refresh(true);
    window.addEventListener("pageshow", restore);
    return () => {
      controller.abort();
      stopProgress();
      window.removeEventListener("pageshow", restore);
    };
  }, [refresh, stopProgress]);

  const connect = async (reconnectId?: string) => {
    const signal = controllerRef.current?.signal;
    if (state.view.status !== "ready" || signal?.aborted || actionPendingRef.current) return;
    if (
      reconnectId !== undefined &&
      !state.view.mailboxes.some(
        (mailbox) => mailbox.id === reconnectId && mailbox.status === "reconnect-required",
      )
    ) {
      return;
    }
    actionPendingRef.current = true;
    dispatch({
      type: "pending",
      action:
        reconnectId === undefined ? { kind: "connect" } : { kind: "reconnect", id: reconnectId },
    });
    try {
      const url = await startGmailConnection({ signal });
      if (!signal?.aborted) window.location.assign(url);
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: "action-error", error });
      actionPendingRef.current = false;
    }
  };

  const disconnect = async (id: string) => {
    const signal = controllerRef.current?.signal;
    if (
      state.view.status !== "ready" ||
      !state.view.mailboxes.some((mailbox) => mailbox.id === id) ||
      signal?.aborted ||
      actionPendingRef.current
    ) {
      return;
    }
    actionPendingRef.current = true;
    stopProgress(id);
    dispatch({ type: "sync-state", id, change: { state: "paused" } });
    dispatch({ type: "pending", action: { kind: "disconnect", id } });
    try {
      await disconnectGmailConnection(id, { signal });
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: "action-error", error });
      actionPendingRef.current = false;
      return;
    }
    actionPendingRef.current = false;
    if (!signal?.aborted) await refresh();
  };

  const sync = async (id: string) => {
    const signal = controllerRef.current?.signal;
    if (
      state.view.status !== "ready" ||
      !state.view.mailboxes.some(
        (mailbox) =>
          mailbox.id === id && mailbox.status === "active" && mailbox.sync.state !== "watching",
      ) ||
      signal?.aborted ||
      actionPendingRef.current
    ) {
      return;
    }
    actionPendingRef.current = true;
    stopProgress(id);
    dispatch({ type: "pending", action: { kind: "sync", id } });
    try {
      const result = await requestGmailSync(id, { signal });
      if (!signal?.aborted) {
        dispatch({ type: "action-finished" });
        watchProgress(id, { request: "queued", counts: result.counts });
      }
    } catch (error) {
      if (!signal?.aborted) {
        dispatch({ type: "action-error", error });
        if (!(error instanceof GmailClientError && error.status === "requires-sign-in")) {
          watchProgress(id, { request: "unconfirmed" });
        }
      }
    } finally {
      actionPendingRef.current = false;
    }
  };

  return (
    <GmailConnectionsScreen
      state={state.view}
      pendingAction={state.pendingAction}
      actionError={state.actionError}
      onRetry={() => void refresh()}
      actions={{
        connect: () => void connect(),
        reconnect: (id) => void connect(id),
        sync: (id) => void sync(id),
        checkProgress: (id) => {
          if (
            !actionPendingRef.current &&
            state.view.status === "ready" &&
            state.view.mailboxes.some((mailbox) => mailbox.id === id)
          ) {
            watchProgress(id);
          }
        },
        disconnect: (id) => void disconnect(id),
      }}
    />
  );
}

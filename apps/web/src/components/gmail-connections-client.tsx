"use client";

import { useEffect, useReducer, useRef } from "react";

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
} from "@/lib/gmail/client";

type ClientState = {
  view: GmailConnectionsState;
  pendingAction: GmailConnectionsProps["pendingAction"];
  actionError: string | undefined;
};

type ClientAction =
  | { type: "loading" }
  | { type: "loaded"; mailboxes: GmailMailbox[] }
  | { type: "load-error"; error: unknown }
  | { type: "pending"; action: NonNullable<ClientState["pendingAction"]> }
  | { type: "sync-queued"; id: string }
  | { type: "action-error"; error: unknown };

function reducer(state: ClientState, action: ClientAction): ClientState {
  switch (action.type) {
    case "loading":
      return { view: { status: "loading" }, pendingAction: undefined, actionError: undefined };
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
    case "sync-queued":
      return {
        ...state,
        view:
          state.view.status === "ready"
            ? {
                ...state.view,
                mailboxes: state.view.mailboxes.map((mailbox) =>
                  mailbox.id === action.id ? { ...mailbox, sync: { state: "queued" } } : mailbox,
                ),
              }
            : state.view,
        pendingAction: undefined,
        actionError: undefined,
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

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = () =>
      void loadGmailConnections({ signal: controller.signal })
        .then((mailboxes) => {
          if (!controller.signal.aborted) dispatch({ type: "loaded", mailboxes });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) dispatch({ type: "load-error", error });
        });
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      actionPendingRef.current = false;
      dispatch({ type: "loading" });
      load();
    };
    load();
    window.addEventListener("pageshow", restore);
    return () => {
      controller.abort();
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  const refresh = async () => {
    const signal = controllerRef.current?.signal;
    if (signal?.aborted || actionPendingRef.current) return;
    dispatch({ type: "loading" });
    try {
      const mailboxes = await loadGmailConnections({ signal });
      if (!signal?.aborted) dispatch({ type: "loaded", mailboxes });
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: "load-error", error });
    }
  };

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
          mailbox.id === id && mailbox.status === "active" && mailbox.sync.state === "idle",
      ) ||
      signal?.aborted ||
      actionPendingRef.current
    ) {
      return;
    }
    actionPendingRef.current = true;
    dispatch({ type: "pending", action: { kind: "sync", id } });
    try {
      await requestGmailSync(id, { signal });
      if (!signal?.aborted) dispatch({ type: "sync-queued", id });
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: "action-error", error });
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
        disconnect: (id) => void disconnect(id),
      }}
    />
  );
}

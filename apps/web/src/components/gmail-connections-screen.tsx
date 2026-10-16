"use client";

import { Button, Card, Chip } from "@monara/ui";
import Link from "next/link";
import { useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import type { GmailConnectionsState, GmailMailbox } from "@/lib/gmail/client";

export type GmailConnectionsProps = {
  state: GmailConnectionsState;
  actions?: {
    connect: () => void;
    reconnect: (id: string) => void;
    sync?: (id: string) => void;
    checkProgress?: (id: string) => void;
    disconnect: (id: string) => void;
  };
  pendingAction?: { id: string; kind: "disconnect" | "reconnect" | "sync" } | { kind: "connect" };
  actionError?: string;
  onRetry?: () => void;
};

const syncDateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function lastSyncLabel(value: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Last sync unavailable"
    : `${syncDateFormatter.format(date)} WIB`;
}

function syncStatusLabel(sync: GmailMailbox["sync"]) {
  if (sync.request === "unconfirmed") return "Request unconfirmed · Check progress before retrying";
  if (sync.state === "watching") {
    return sync.request === "queued" ? "Sync queued · Updating counts…" : "Updating counts…";
  }
  if (sync.state === "paused") return "Updates paused · Imports may continue";
  return sync.request === "queued" ? "Sync queued" : null;
}

function SyncStatus({ sync }: { sync: GmailMailbox["sync"] }) {
  const status = syncStatusLabel(sync);
  return (
    <div className="mt-4 space-y-3 text-sm">
      {sync.counts && (
        <div className="rounded-xl bg-accent-soft p-3">
          <p className="font-semibold">Import history</p>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Imported", sync.counts.imported],
              ["Skipped", sync.counts.skipped],
              ["Failed", sync.counts.failed],
            ].map(([label, count]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 font-bold tabular-nums">{count.toLocaleString("en-GB")}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-1 text-xs leading-5 text-muted">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-focus">
              Details
            </summary>
            <p>
              {sync.counts.importedTransactions.toLocaleString("en-GB")} transactions created ·{" "}
              {sync.counts.inProgress.toLocaleString("en-GB")} emails processing
            </p>
            Email totals across all imports. Queued emails may appear later; these counts do not
            confirm a sync is finished.
          </details>
        </div>
      )}
      {sync.state === "error" && (
        <p role="alert" className="text-danger">
          {sync.message}
        </p>
      )}
      {sync.state !== "error" && status && (
        <p role="status" className="text-muted">
          {status}
        </p>
      )}
    </div>
  );
}

function ConnectionNotice({ state, onRetry }: Pick<GmailConnectionsProps, "state" | "onRetry">) {
  const showSignIn = state.status === "requires-sign-in";
  return (
    <>
      {state.status === "unavailable" && (
        <p className="mt-4 text-sm leading-6 text-muted">
          Gmail connections are unavailable right now. Try again later.
        </p>
      )}
      {state.status === "requires-sign-in" && (
        <p className="mt-4 text-sm text-muted">Sign in before connecting a mailbox.</p>
      )}
      {showSignIn && (
        <Link
          href="/sign-in?next=/connections/gmail"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
        >
          Go to sign in →
        </Link>
      )}
      {state.status === "ready" && state.mailboxes.length >= 3 && (
        <p className="mt-4 text-sm text-muted">
          You have reached the three-mailbox limit. Disconnect one before adding another.
        </p>
      )}
      {state.status === "loading" && (
        <p className="mt-4 text-sm text-muted" role="status">
          Loading your connections…
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      {(state.status === "error" || state.status === "unavailable") && onRetry && (
        <Button className="mt-4 min-h-11" variant="secondary" onPress={onRetry}>
          Retry loading connections
        </Button>
      )}
    </>
  );
}

function ConnectionIntro({
  state,
  actions,
  pendingAction,
  actionError,
  onRetry,
}: GmailConnectionsProps) {
  const count = state.status === "ready" ? state.mailboxes.length : 0;
  const canConnect = state.status === "ready" && count < 3 && !!actions && !pendingAction;
  return (
    <Card className="block gap-0 mt-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">Connect Gmail</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Gmail access is separate from sign-in. Import transaction emails from the last 30 days.
      </p>
      <Button className="mt-4 min-h-11" isDisabled={!canConnect} onPress={actions?.connect}>
        {state.status === "ready" && pendingAction?.kind === "connect"
          ? "Connecting…"
          : "Connect Gmail"}
      </Button>
      <ConnectionNotice state={state} onRetry={onRetry} />
      {actionError && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {actionError}
        </p>
      )}
      {actionError && state.status === "ready" && onRetry && (
        <Button className="mt-4 min-h-11" variant="secondary" onPress={onRetry}>
          Reload connections
        </Button>
      )}
    </Card>
  );
}

type MailboxCardProps = {
  mailbox: GmailMailbox;
  actions: GmailConnectionsProps["actions"];
  pendingAction: GmailConnectionsProps["pendingAction"];
  onDisconnect: (id: string) => void;
};

function MailboxImportAction({
  mailbox,
  actions,
  pendingAction,
}: Omit<MailboxCardProps, "onDisconnect">) {
  const busy = pendingAction !== undefined;
  if (mailbox.status !== "active") {
    return (
      <Button
        className="min-h-11"
        aria-label={`Reconnect ${mailbox.email}`}
        isDisabled={!actions || busy}
        onPress={() => actions?.reconnect(mailbox.id)}
      >
        {pendingAction?.kind === "reconnect" && pendingAction.id === mailbox.id
          ? "Reconnecting…"
          : "Reconnect"}
      </Button>
    );
  }
  return (
    <Button
      className="min-h-11"
      aria-label={`Sync ${mailbox.email} now`}
      isDisabled={!actions?.sync || busy || mailbox.sync.state === "watching"}
      onPress={() => actions?.sync?.(mailbox.id)}
    >
      {pendingAction?.kind === "sync" && pendingAction.id === mailbox.id
        ? "Queueing sync…"
        : mailbox.sync.request === "none"
          ? "Sync now"
          : "Sync again"}
    </Button>
  );
}

function MailboxActions({ mailbox, actions, pendingAction, onDisconnect }: MailboxCardProps) {
  const busy = pendingAction !== undefined;
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <MailboxImportAction mailbox={mailbox} actions={actions} pendingAction={pendingAction} />
      {actions?.checkProgress && (
        <Button
          variant="secondary"
          className="min-h-11"
          aria-label={`Check import progress for ${mailbox.email}`}
          isDisabled={busy || mailbox.sync.state === "watching"}
          onPress={() => actions.checkProgress?.(mailbox.id)}
        >
          {mailbox.sync.state === "watching" ? "Checking progress…" : "Check progress"}
        </Button>
      )}
      <Button
        variant="ghost"
        className="min-h-11"
        aria-label={`Disconnect ${mailbox.email}`}
        isDisabled={!actions || busy}
        onPress={() => onDisconnect(mailbox.id)}
      >
        {pendingAction?.kind === "disconnect" && pendingAction.id === mailbox.id
          ? "Disconnecting…"
          : "Disconnect"}
      </Button>
    </div>
  );
}

function MailboxCard({ mailbox, actions, pendingAction, onDisconnect }: MailboxCardProps) {
  return (
    <Card className="block gap-0 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-all font-bold">{mailbox.email}</h2>
        <Chip variant="soft" color={mailbox.status === "active" ? "success" : "warning"}>
          {mailbox.status === "active" ? "Connected" : "Reconnect needed"}
        </Chip>
      </div>
      <p className="mt-3 text-sm text-muted">
        Last mailbox scan: {lastSyncLabel(mailbox.lastSyncedAt)}
      </p>
      <SyncStatus sync={mailbox.sync} />
      <MailboxActions
        mailbox={mailbox}
        actions={actions}
        pendingAction={pendingAction}
        onDisconnect={onDisconnect}
      />
      {mailbox.status === "active" && !actions?.sync && (
        <p className="mt-3 text-sm text-muted">Manual sync is not available yet.</p>
      )}
    </Card>
  );
}

export function GmailConnectionsScreen({
  state,
  actions,
  pendingAction,
  actionError,
  onRetry,
}: GmailConnectionsProps) {
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const mailboxes = state.status === "ready" ? state.mailboxes : [];
  const selected = mailboxes.find((mailbox) => mailbox.id === disconnectId);
  const busy = pendingAction !== undefined;

  return (
    <main className="mx-auto max-w-3xl pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] sm:py-8">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
      >
        ← Back to Monara
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="mt-2 text-[32px] font-extrabold tracking-[-0.04em]">Gmail</h1>
        </div>
        {state.status === "ready" && <Chip variant="soft">{mailboxes.length} of 3 connected</Chip>}
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        Up to 3 mailboxes. Imports wait for your review.
      </p>
      <ConnectionIntro
        state={state}
        actions={actions}
        pendingAction={pendingAction}
        actionError={actionError}
        onRetry={onRetry}
      />
      {state.status === "ready" && mailboxes.length === 0 && (
        <p className="mt-7 rounded-2xl border border-dashed border-border p-8 text-center text-muted">
          No mailboxes connected. Add your first Gmail account to get started.
        </p>
      )}
      <div className="mt-6 space-y-4">
        {mailboxes.map((mailbox) => (
          <MailboxCard
            key={mailbox.id}
            mailbox={mailbox}
            actions={actions}
            pendingAction={pendingAction}
            onDisconnect={setDisconnectId}
          />
        ))}
      </div>
      {selected && actions && (
        <ModalDialog labelledBy="disconnect-title" onClose={() => setDisconnectId(null)}>
          <div className="p-7">
            <h2 id="disconnect-title" className="text-xl font-bold">
              Disconnect Gmail?
            </h2>
            <p className="mt-3 break-words leading-7 text-muted">
              Stop future imports from {selected.email}. Transactions already imported will stay in
              Monara.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onPress={() => setDisconnectId(null)}>
                Keep connected
              </Button>
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={() => {
                  actions.disconnect(selected.id);
                  setDisconnectId(null);
                }}
              >
                Disconnect mailbox
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}
    </main>
  );
}

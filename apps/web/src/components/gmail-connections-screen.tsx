"use client";

import { Button, Card, Chip } from "@monara/ui";
import Link from "next/link";
import { useState } from "react";
import { GmailAccountSuggestions } from "@/components/gmail-account-suggestions";
import { ModalDialog } from "@/components/modal-dialog";
import type { GmailConnectionsState, GmailMailbox } from "@/lib/gmail/client";

export type GmailConnectionsProps = {
  state: GmailConnectionsState;
  actions?: {
    connect: () => void;
    reconnect: (id: string) => void;
    sync?: (id: string) => void;
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

function SyncStatus({ sync }: { sync: GmailMailbox["sync"] }) {
  if (sync.state === "idle") return null;
  if (sync.state === "failed")
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {sync.message}
      </p>
    );
  if (sync.state === "completed")
    return (
      <p role="status" className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-foreground">
        Last sync: {sync.transactions} {sync.transactions === 1 ? "transaction" : "transactions"}
        {sync.confirmed > 0 ? ` (${sync.confirmed} confirmed automatically)` : ""} · {sync.skipped}{" "}
        skipped · {sync.failed} failed
      </p>
    );
  return (
    <p role="status" className="mt-4 text-sm text-muted">
      {sync.state === "queued" ? "Sync queued…" : "Importing transactions…"}
    </p>
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
      <h2 className="text-lg font-bold">Connect Gmail separately</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Google sign-in opens your Monara account. Connecting Gmail gives permission to import
        transaction emails from the last 30 days.
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

function MailboxActions({ mailbox, actions, pendingAction, onDisconnect }: MailboxCardProps) {
  const busy = pendingAction !== undefined;
  const syncing =
    mailbox.sync.state === "queued" ||
    mailbox.sync.state === "running" ||
    (pendingAction?.kind === "sync" && pendingAction.id === mailbox.id);
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {mailbox.status === "active" ? (
        <Button
          className="min-h-11"
          aria-label={`Sync ${mailbox.email} now`}
          isDisabled={!actions?.sync || busy || syncing}
          onPress={() => actions?.sync?.(mailbox.id)}
        >
          {mailbox.sync.state === "queued"
            ? "Sync queued"
            : syncing
              ? "Sync in progress…"
              : "Sync now"}
        </Button>
      ) : (
        <Button
          className="min-h-11"
          aria-label={`Reconnect ${mailbox.email}`}
          isDisabled={!actions || busy}
          onPress={() => actions?.reconnect(mailbox.id)}
        >
          Reconnect
        </Button>
      )}
      <Button
        variant="secondary"
        className="min-h-11"
        aria-label={`Disconnect ${mailbox.email}`}
        isDisabled={!actions || busy}
        onPress={() => onDisconnect(mailbox.id)}
      >
        Disconnect
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
        Last successful sync: {lastSyncLabel(mailbox.lastSyncedAt)}
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
      {mailbox.status === "active" && actions && (
        <GmailAccountSuggestions connectionId={mailbox.id} />
      )}
      {pendingAction && "id" in pendingAction && pendingAction.id === mailbox.id && (
        <p role="status" className="mt-3 text-sm text-muted">
          {pendingAction.kind === "disconnect"
            ? "Disconnecting…"
            : pendingAction.kind === "reconnect"
              ? "Reconnecting…"
              : "Queueing sync…"}
        </p>
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
          <p className="text-sm font-semibold text-accent">Connections</p>
          <h1 className="mt-2 text-[32px] font-extrabold tracking-[-0.04em]">
            Your Gmail mailboxes
          </h1>
        </div>
        {state.status === "ready" && <Chip variant="soft">{mailboxes.length} of 3 connected</Chip>}
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        Connect up to three mailboxes. Imported transactions wait for your review before they count
        toward your totals, unless Monara is confident about every detail.
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
      <p className="mt-5 text-sm leading-6 text-muted">
        Monara confirms an imported expense or income automatically only when it is confident and
        the email states the amount, date, and one of your accounts. Everything else, including an
        exclusion, waits for you to review, edit, confirm, or exclude. You can still edit or delete
        any confirmed transaction.
      </p>
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

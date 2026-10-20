"use client";

import { Button, Card, Chip } from "@monara/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { DeleteAccountControl } from "@/components/delete-account-control";
import { Icon } from "@/components/icon";
import { InstallAppButton } from "@/components/install-app-button";
import { MonaraMascot } from "@/components/monara-mascot";
import { SectionTitle } from "@/components/visual";
import { WhatsAppLinkRow } from "@/components/whatsapp-link-row";
import type { AuthenticatedProfile } from "@/lib/auth/identity";
import { loadGmailConnections } from "@/lib/gmail/client";
import { legalHref } from "@/lib/legal/return";

function Row({ title, detail, end }: { title: string; detail?: string; end?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-muted">{detail}</p> : null}
      </div>
      {end ? <div className="shrink-0 text-right text-xs font-medium text-muted">{end}</div> : null}
    </div>
  );
}

function LinkRow({
  href,
  title,
  detail,
  badge,
}: {
  href: string;
  title: string;
  detail: string;
  badge?: string;
}) {
  return (
    <Link
      className="-mx-5 flex min-h-16 items-center gap-3 px-5 py-2.5 transition-colors duration-100 hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus active:bg-surface-secondary"
      href={href}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      {badge ? (
        <Chip className="shrink-0" color="accent" size="sm" variant="soft">
          {badge}
        </Chip>
      ) : null}
      <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
    </Link>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-5">
      <SectionTitle id={id} title={title} />
      <Card className="mt-2 block gap-0 overflow-hidden rounded-2xl border border-border px-5 py-0.5">
        <div className="divide-y divide-separator">{children}</div>
      </Card>
    </section>
  );
}

function ProfileIdentity({ profile, demo }: { profile: AuthenticatedProfile; demo: boolean }) {
  return (
    <Card className="mt-4 block gap-0 rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <MonaraMascot className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">
            {demo ? "Your space" : profile.displayName}
          </h2>
          {demo ? null : (
            <p className="mt-1 break-all text-sm text-muted">{profile.email ?? "Google account"}</p>
          )}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-separator pt-4 text-xs">
        <div>
          <dt className="text-muted">Currency</dt>
          <dd className="mt-1 font-medium">IDR</dd>
        </div>
        <div>
          <dt className="text-muted">Ledger dates</dt>
          <dd className="mt-1 font-medium">UTC</dd>
        </div>
      </dl>
    </Card>
  );
}

function DemoSignup() {
  return (
    <section
      aria-labelledby="make-it-yours"
      className="mt-5 rounded-3xl bg-foreground p-5 text-white"
    >
      <h2 className="text-xl font-extrabold tracking-[-0.03em]" id="make-it-yours">
        Make it yours
      </h2>
      <p className="mt-1 text-sm leading-6 opacity-80">
        Sign in with Google to keep a private ledger. Your records stay yours.
      </p>
      <Link
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-surface px-5 text-[15px] font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href="/sign-in"
      >
        Continue with Google
      </Link>
    </section>
  );
}

/** Banks found in the User's mailboxes since they connected, with no account yet. */
function useNewGmailAccounts(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadGmailConnections({ signal: controller.signal }).then(
      (mailboxes) => {
        if (controller.signal.aborted) return;
        setCount(
          mailboxes
            .filter((mailbox) => mailbox.status === "active")
            .reduce((total, mailbox) => total + mailbox.newAccounts, 0),
        );
      },
      // The row still links to Gmail settings when the count cannot be read.
      () => undefined,
    );
    return () => controller.abort();
  }, []);
  return count;
}

function GmailLinkRow() {
  const newAccounts = useNewGmailAccounts();
  return (
    <LinkRow
      badge={newAccounts > 0 ? `${newAccounts} new` : undefined}
      detail={
        newAccounts > 0
          ? `${newAccounts === 1 ? "A new bank or wallet" : "New banks or wallets"} found in your email`
          : "Manage connections · up to 3 mailboxes"
      }
      href="/connections/gmail"
      title="Gmail"
    />
  );
}

function ProfileConnections({ demo }: { demo: boolean }) {
  return (
    <Group id="connections" title="Connections">
      <Row
        detail="Separate from Gmail access"
        end={demo ? "Not signed in" : "Connected"}
        title="Google sign-in"
      />
      {demo ? (
        <LinkRow
          detail="Sign in first · up to 3 mailboxes"
          href="/sign-in?next=/connections/gmail"
          title="Gmail"
        />
      ) : (
        <GmailLinkRow />
      )}
      {demo ? (
        <Row detail="Sign in first to link your number." end="Not linked" title="WhatsApp" />
      ) : (
        <WhatsAppLinkRow />
      )}
    </Group>
  );
}

function ProfileAccount({ online, setupKey }: { online: boolean; setupKey?: string }) {
  return (
    <Group id="account" title="Account">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Current session</p>
          <p className="mt-0.5 text-xs text-muted">Sign out on this device.</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <Button className="min-h-11" type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
      <DeleteAccountControl online={online} setupKey={setupKey} />
    </Group>
  );
}

function ProfileLegal() {
  // Back on a legal page returns to this Profile, whether the real one or the demo's.
  const from = usePathname();
  return (
    <Group id="legal" title="Legal">
      <LinkRow detail="The terms for using Monara." href={legalHref("terms", from)} title="Terms" />
      <LinkRow
        detail="How your email and data are handled."
        href={legalHref("privacy", from)}
        title="Privacy Policy"
      />
    </Group>
  );
}

function ProfileReminderSettings({ onOpenReminders }: { onOpenReminders: () => void }) {
  return (
    <Group id="reminders" title="Reminder settings">
      <Button
        className="-mx-5 flex h-auto min-h-16 w-[calc(100%+2.5rem)] justify-start gap-3 rounded-none px-5 py-2.5 text-left hover:bg-surface-secondary focus-visible:-outline-offset-2 active:bg-surface-secondary"
        onPress={onOpenReminders}
        variant="ghost"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">In-app reminders</span>
          <span className="mt-1 block text-xs font-normal leading-5 text-muted">
            Open Notifications
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-muted">Always on</span>
        <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
      </Button>
      <Row
        detail="Requires a verified WhatsApp link."
        end="Unavailable"
        title="WhatsApp reminders"
      />
    </Group>
  );
}

function ProfileAppSettings({
  online,
  onReplayTour,
}: {
  online: boolean;
  onReplayTour?: () => void;
}) {
  return (
    <Group id="app" title="App">
      <Row
        end={
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-warning"}`}
            />
            {online ? "Online" : "Offline"}
          </span>
        }
        detail={online ? "Live operations need a connection." : "Reconnect for live operations."}
        title="Connection"
      />
      <Row detail="Add it to your home screen." end={<InstallAppButton />} title="Install Monara" />
      {onReplayTour ? (
        <Row
          detail="A one-minute look at the essentials."
          end={
            <Button className="min-h-11" onPress={onReplayTour} variant="secondary">
              Replay
            </Button>
          }
          title="Quick tour"
        />
      ) : null}
    </Group>
  );
}

export function ProfileScreen({
  online,
  profile,
  demo = false,
  financialAccounts,
  financialCategories,
  onOpenReminders,
  onReplayTour,
}: {
  online: boolean;
  profile: AuthenticatedProfile;
  demo?: boolean;
  financialAccounts?: ReactNode;
  financialCategories?: ReactNode;
  onOpenReminders: () => void;
  onReplayTour?: () => void;
}) {
  return (
    <div>
      <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">Profile</h1>
      <ProfileIdentity demo={demo} profile={profile} />
      {demo ? <DemoSignup /> : null}
      {financialAccounts}
      {financialCategories}
      <ProfileConnections demo={demo} />
      {demo || profile.demoAccount ? null : (
        <ProfileAccount online={online} setupKey={profile.setupKey} />
      )}
      <ProfileReminderSettings onOpenReminders={onOpenReminders} />
      <ProfileAppSettings online={online} onReplayTour={onReplayTour} />
      <ProfileLegal />
      <p className="mt-4 px-1 text-xs leading-5 text-muted">
        Your records are private to you. Monara never stores Gmail passwords or OAuth tokens, and
        nothing financial is saved for offline use.
      </p>
    </div>
  );
}

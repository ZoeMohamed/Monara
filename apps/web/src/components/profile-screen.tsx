"use client";

import { Button, Card, Label, Switch } from "@monara/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";
import { InstallAppButton } from "@/components/install-app-button";
import { MonaraMascot } from "@/components/monara-mascot";
import { SectionTitle } from "@/components/visual";
import type { AuthenticatedProfile } from "@/lib/auth/identity";

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

function LinkRow({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      className="-mx-4 flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus active:bg-surface-secondary"
      href={href}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
    </Link>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-5">
      <SectionTitle id={id} title={title} />
      <Card className="mt-2 block gap-0 overflow-hidden rounded-2xl border border-border px-4 py-0.5">
        <div className="divide-y divide-separator">{children}</div>
      </Card>
    </section>
  );
}

export function ProfileScreen({
  online,
  profile,
}: {
  online: boolean;
  profile: AuthenticatedProfile;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Profile</h1>

      <Card className="mt-4 block gap-0 rounded-2xl border border-border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <MonaraMascot className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">
              {profile.displayName}
            </h2>
            <p className="mt-1 break-all text-sm text-muted">{profile.email ?? "Google account"}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-separator pt-4 text-xs">
          <div>
            <dt className="text-muted">Currency</dt>
            <dd className="mt-1 font-medium">IDR</dd>
          </div>
          <div>
            <dt className="text-muted">Time zone</dt>
            <dd className="mt-1 font-medium">Asia/Jakarta</dd>
          </div>
        </dl>
      </Card>

      <Group id="connections" title="Connections">
        <Row detail="Separate from Gmail access" end="Connected" title="Google sign-in" />
        <LinkRow
          detail="Manage connections · up to 3 mailboxes"
          href="/connections/gmail"
          title="Gmail"
        />
        <Row
          detail="Linking opens once number verification is ready."
          end="Not linked"
          title="WhatsApp"
        />
      </Group>

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
      </Group>

      <Group id="reminders" title="Reminders">
        <Row
          detail="Budget and bill reminders in the app."
          end={<span className="text-success">Always on</span>}
          title="In-app"
        />
        <div className="flex items-start gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <Switch isDisabled isSelected={false}>
              <Switch.Content className="flex w-full items-center justify-between gap-3">
                <Label className="text-sm font-medium">WhatsApp reminders</Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
            <p className="mt-1 text-xs leading-5 text-muted">Link and verify WhatsApp first.</p>
          </div>
        </div>
        <Row detail="WhatsApp reminders wait until 07:00." end="22:00–07:00" title="Quiet hours" />
        <Row detail="Extra reminders are combined." end="3 a day" title="WhatsApp limit" />
      </Group>

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
        <Row
          detail="Add it to your home screen."
          end={<InstallAppButton />}
          title="Install Monara"
        />
      </Group>

      <p className="mt-4 px-1 text-xs leading-5 text-muted">
        Your records are private to you. Monara never stores Gmail passwords or OAuth tokens, and
        nothing financial is saved for offline use.
      </p>
    </div>
  );
}

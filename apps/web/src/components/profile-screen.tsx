"use client";

import { Avatar, Card, Label, Switch } from "@monara/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";
import { InstallAppButton } from "@/components/install-app-button";

function Row({ title, detail, end }: { title: string; detail?: string; end?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
      </div>
      {end ? <div className="shrink-0 text-sm text-muted">{end}</div> : null}
    </div>
  );
}

function LinkRow({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      className="-mx-4 flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors duration-100 active:bg-surface-secondary"
      href={href}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
      <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
    </Link>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-5">
      <h2 id={id} className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {title}
      </h2>
      <Card className="mt-2 block gap-0 rounded-2xl border border-border px-4 py-0.5">
        <div className="divide-y divide-separator">{children}</div>
      </Card>
    </section>
  );
}

export function ProfileScreen({ online }: { online: boolean }) {
  return (
    <div>
      <h1 className="text-2xl font-black tracking-[-0.05em] sm:text-4xl">Profile</h1>

      <Card className="mt-3 block gap-0 rounded-2xl bg-accent-soft p-4">
        <div className="flex items-center gap-3">
          <Avatar aria-label="Demo profile" className="h-11 w-11 rounded-xl bg-surface text-accent">
            <Avatar.Fallback>M</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-bold">Demo profile</p>
            <p className="mt-0.5 text-xs text-accent-soft-foreground">
              Sample data · not signed in · IDR · Asia/Jakarta
            </p>
          </div>
        </div>
      </Card>

      <Group id="connections" title="Connections">
        <LinkRow detail="Separate from Gmail access" href="/sign-in" title="Sign in with Google" />
        <LinkRow
          detail="Up to 3 mailboxes · not connected"
          href="/connections/gmail"
          title="Gmail"
        />
        <Row
          detail="Linking opens once number verification is ready."
          end="Not linked"
          title="WhatsApp"
        />
      </Group>

      <Group id="reminders" title="Reminders">
        <Row detail="Budget and bill reminders in the app." end="Always on" title="In-app" />
        <div className="py-2.5">
          <Switch isDisabled isSelected={false}>
            <Switch.Content className="flex w-full items-center justify-between gap-3">
              <Label className="text-sm font-semibold">WhatsApp reminders</Label>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          <p className="mt-0.5 text-xs text-muted">Link and verify WhatsApp first.</p>
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
        <div className="flex min-h-14 items-center justify-between gap-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Install Monara</p>
            <p className="mt-0.5 text-xs text-muted">Add it to your home screen.</p>
          </div>
          <InstallAppButton />
        </div>
      </Group>

      <p className="mt-4 flex items-start gap-2 px-1 text-xs text-muted">
        <Icon className="mt-px h-4 w-4 shrink-0 text-accent" name="shield" />
        Your records are private to you. Monara never stores Gmail passwords or OAuth tokens, and
        nothing financial is saved for offline use.
      </p>
    </div>
  );
}

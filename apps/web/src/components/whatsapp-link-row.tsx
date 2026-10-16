"use client";

import { startWhatsAppLinkResultSchema } from "@monara/contracts";
import { Button, FieldError, Input, Label, TextField } from "@monara/ui";
import { type FormEvent, useEffect, useState } from "react";

import { loadWhatsAppLink, sendWhatsAppLink, type WhatsAppLinkView } from "@/lib/whatsapp/client";

/**
 * Settings row for the WhatsApp Link (F12). The User enters their number, gets a
 * six-digit code, and sends it from that number to Monara on WhatsApp.
 */
export function WhatsAppLinkRow() {
  const [view, setView] = useState<WhatsAppLinkView>({ step: "loading" });
  const [form, setForm] = useState({ phone: "", pending: false, error: null as string | null });

  const refresh = async () => setView(await loadWhatsAppLink());

  useEffect(() => {
    const controller = new AbortController();
    void loadWhatsAppLink(controller.signal).then((next) => {
      if (!controller.signal.aborted) setView(next);
    });
    return () => controller.abort();
  }, []);

  const send = async (method: "POST" | "DELETE", body?: unknown) => {
    setForm((previous) => ({ ...previous, pending: true, error: null }));
    try {
      const result = await sendWhatsAppLink(method, body);
      setForm({ phone: "", pending: false, error: null });
      return result;
    } catch (error) {
      setForm((previous) => ({
        ...previous,
        pending: false,
        error: error instanceof Error ? error.message : "That didn't work. Try again.",
      }));
      return null;
    }
  };

  const start = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await send("POST", { phone: form.phone });
    if (result) setView({ step: "code", challenge: startWhatsAppLinkResultSchema.parse(result) });
  };

  const unlink = async () => {
    if ((await send("DELETE")) !== null) await refresh();
  };

  if (view.step === "loading") return <Status detail="Checking your link…" end="…" />;
  if (view.step === "unavailable") return <Status detail={view.message} end="Unavailable" />;

  if (view.step === "code") {
    const { challenge } = view;
    const sendTo = challenge.sendTo;
    return (
      <div className="py-3">
        <p className="text-sm font-medium">WhatsApp</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          From the number ending {challenge.phoneLastFour}, send this code to Monara on WhatsApp
          {sendTo ? ` (${sendTo})` : ""} within 10 minutes.
        </p>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-[0.3em]">{challenge.code}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sendTo ? (
            <a
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              href={`https://wa.me/${sendTo.slice(1)}?text=${challenge.code}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open WhatsApp
            </a>
          ) : null}
          <Button className="min-h-11" onPress={() => void refresh()} variant="secondary">
            I&apos;ve sent it
          </Button>
        </div>
      </div>
    );
  }

  const { link } = view;
  if (link.status === "verified") {
    return (
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">WhatsApp</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Linked to the number ending {link.phoneLastFour}. Chat with Monara there.
          </p>
          {form.error ? <p className="mt-1 text-xs text-danger">{form.error}</p> : null}
        </div>
        <Button
          className="min-h-11"
          isDisabled={form.pending}
          onPress={() => void unlink()}
          variant="secondary"
        >
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <form className="py-3" onSubmit={(event) => void start(event)}>
      <p className="text-sm font-medium">WhatsApp</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {link.status === "pending"
          ? `Waiting for the code from the number ending ${link.phoneLastFour}. Get a new code if you lost it.`
          : "Link your number to log spending and ask questions on WhatsApp."}
      </p>
      <TextField
        className="mt-3"
        isDisabled={form.pending}
        isInvalid={Boolean(form.error)}
        name="phone"
        onChange={(phone) => setForm((previous) => ({ ...previous, phone, error: null }))}
        type="tel"
        value={form.phone}
      >
        <Label>Number with country code</Label>
        <Input className="min-h-11 text-base" inputMode="tel" placeholder="+62 812 3456 7890" />
        <FieldError>{form.error}</FieldError>
      </TextField>
      <Button className="mt-3 min-h-11" isDisabled={form.pending} type="submit">
        {link.status === "pending" ? "Get a new code" : "Get a code"}
      </Button>
    </form>
  );
}

function Status({ detail, end }: { detail: string; end: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">WhatsApp</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      <div className="shrink-0 text-right text-xs font-medium text-muted">{end}</div>
    </div>
  );
}

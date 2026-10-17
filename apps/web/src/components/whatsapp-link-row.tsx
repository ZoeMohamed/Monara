"use client";

import { Button, Input, Label, TextField } from "@monara/ui";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { ModalDialog } from "@/components/modal-dialog";
import { useWhatsAppLink } from "@/components/use-whatsapp-link";

type LinkControls = ReturnType<typeof useWhatsAppLink>;

function Feedback({ controls }: { controls: LinkControls }) {
  return (
    <>
      {controls.error && (
        <p className="mt-2 text-xs leading-5 text-danger" role="alert">
          {controls.error}
        </p>
      )}
      {controls.notice && !controls.error && (
        <p className="mt-2 text-xs leading-5 text-muted" role="status">
          {controls.notice}
        </p>
      )}
    </>
  );
}

function CheckStatus({ controls }: { controls: LinkControls }) {
  return controls.requiresSignIn ? (
    <Link
      className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      href="/sign-in?next=/profile"
    >
      Sign in again
    </Link>
  ) : (
    <Button
      className="min-h-11"
      isDisabled={controls.checking || controls.mutation !== null}
      onPress={() => void controls.refresh()}
      variant="secondary"
    >
      {controls.checking ? "Checking…" : "Check status"}
    </Button>
  );
}

function Challenge({
  controls,
  onChangeNumber,
}: {
  controls: LinkControls;
  onChangeNumber: () => void;
}) {
  const challenge = controls.challenge;
  const codeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    codeRef.current?.focus({ preventScroll: true });
  }, []);
  if (!challenge) return null;
  return (
    <>
      <p className="mt-1 text-xs leading-5 text-muted">
        Send this code from your number ending {challenge.phoneLastFour} to Monara.
      </p>
      <p
        className="mt-3 select-all rounded-lg font-mono text-2xl font-semibold tracking-[0.3em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        ref={codeRef}
        tabIndex={-1}
      >
        <span aria-hidden>{challenge.code}</span>
        <span className="sr-only">Verification code {challenge.code.split("").join(" ")}</span>
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Expires at{" "}
        <time dateTime={challenge.expiresAt}>
          {new Date(challenge.expiresAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC",
          })}
        </time>
        {" UTC"}
      </p>
      {!challenge.sendTo && (
        <p className="mt-2 text-xs leading-5 text-warning-soft-foreground" role="status">
          Monara’s WhatsApp number is unavailable. Try again later.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {challenge.sendTo && !controls.requiresSignIn && (
          <a
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={`https://wa.me/${challenge.sendTo.slice(1)}?text=${challenge.code}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open WhatsApp
          </a>
        )}
        <CheckStatus controls={controls} />
        <Button
          className="min-h-11"
          isDisabled={
            controls.mutation !== null || controls.recoveryRequired || controls.requiresSignIn
          }
          onPress={onChangeNumber}
          variant="ghost"
        >
          Change number
        </Button>
      </div>
    </>
  );
}

function LinkForm({ controls, phoneId }: { controls: LinkControls; phoneId: string }) {
  const disabled =
    controls.mutation !== null ||
    controls.recoveryRequired ||
    controls.requiresSignIn ||
    controls.link === null;
  const pending = controls.link?.status === "pending";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void controls.start();
      }}
    >
      <p className="mt-1 text-xs leading-5 text-muted">
        {pending
          ? controls.expired
            ? "Get a new code to finish linking your number."
            : "A new code replaces the current one."
          : "Link your number to chat with Monara on WhatsApp."}
      </p>
      <TextField
        className="mt-3"
        isDisabled={disabled}
        isInvalid={controls.phoneInvalid}
        name="phone"
        onChange={controls.setPhone}
        type="tel"
        value={controls.phone}
      >
        <Label htmlFor={phoneId}>Number with country code</Label>
        <Input
          className="min-h-11 text-base"
          id={phoneId}
          inputMode="tel"
          maxLength={40}
          placeholder="+62 812 3456 7890"
        />
      </TextField>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" isDisabled={disabled} type="submit">
          {controls.mutation === "start"
            ? "Getting a code…"
            : pending
              ? "Get a new code"
              : "Get a code"}
        </Button>
        {(pending || controls.recoveryRequired || controls.requiresSignIn) && (
          <CheckStatus controls={controls} />
        )}
      </div>
    </form>
  );
}

function Linked({ controls }: { controls: LinkControls }) {
  if (controls.link?.status !== "verified") return null;
  return (
    <>
      <p className="mt-1 text-xs leading-5 text-muted">
        Number ending {controls.link.phoneLastFour}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          isDisabled={
            controls.mutation !== null || controls.recoveryRequired || controls.requiresSignIn
          }
          onPress={controls.requestUnlink}
          variant="secondary"
        >
          Unlink
        </Button>
        {(controls.recoveryRequired || controls.requiresSignIn) && (
          <CheckStatus controls={controls} />
        )}
      </div>
    </>
  );
}

function UnlinkConfirmation({ controls }: { controls: LinkControls }) {
  const title = useId();
  if (controls.link?.status !== "verified" || !controls.confirmUnlink) return null;
  return (
    <ModalDialog labelledBy={title} onClose={controls.cancelUnlink}>
      <div aria-busy={controls.mutation === "unlink"} className="p-6">
        <h2 className="text-xl font-bold" id={title}>
          Unlink WhatsApp?
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          This number will lose access to your Monara records on WhatsApp.
        </p>
        <Feedback controls={controls} />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            className="min-h-11"
            isDisabled={controls.mutation !== null}
            onPress={controls.cancelUnlink}
            variant="secondary"
          >
            Keep linked
          </Button>
          {controls.recoveryRequired || controls.requiresSignIn ? (
            <CheckStatus controls={controls} />
          ) : (
            <Button
              className="min-h-11"
              isDisabled={controls.mutation !== null}
              onPress={() => void controls.unlink()}
              variant="danger"
            >
              {controls.mutation === "unlink" ? "Unlinking…" : "Unlink number"}
            </Button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

function LinkContent({
  controls,
  phoneId,
  onChangeNumber,
}: {
  controls: LinkControls;
  phoneId: string;
  onChangeNumber: () => void;
}) {
  if (controls.link === null) {
    return controls.checking ? (
      <p className="mt-1 text-xs leading-5 text-muted" role="status">
        Checking your link…
      </p>
    ) : (
      <div className="mt-3">
        <CheckStatus controls={controls} />
      </div>
    );
  }
  if (controls.link.status === "verified") return <Linked controls={controls} />;
  if (controls.challenge) return <Challenge controls={controls} onChangeNumber={onChangeNumber} />;
  return <LinkForm controls={controls} phoneId={phoneId} />;
}

/** One-time linking codes stay in this mounted row; no number or code is persisted. */
export function WhatsAppLinkRow() {
  const controls = useWhatsAppLink();
  const phoneId = useId();
  const changeNumber = () => {
    controls.editNumber();
    requestAnimationFrame(() => document.getElementById(phoneId)?.focus());
  };
  return (
    <div aria-busy={controls.mutation !== null} className="min-w-0 py-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="text-sm font-medium">WhatsApp</p>
        {controls.link?.status === "verified" && (
          <span className="text-xs font-medium text-success">Linked</span>
        )}
      </div>
      <LinkContent controls={controls} phoneId={phoneId} onChangeNumber={changeNumber} />
      {!controls.confirmUnlink && <Feedback controls={controls} />}
      <UnlinkConfirmation controls={controls} />
    </div>
  );
}

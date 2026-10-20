"use client";

import { Button } from "@monara/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import styles from "@/components/session-toast.module.css";
import type { SaveNotice } from "@/components/use-monara-session";

// An Undo needs time to be noticed and used, so it stays up longer than a plain confirmation.
const messageMs = 5_000;
const undoMs = 9_000;
const recoveryLabels = { refresh: "Refresh", history: "History", budgets: "Budgets" } as const;

function subscribeToDialogs(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  return () => observer.disconnect();
}

function dialogIsOpen() {
  return document.querySelector('[role="dialog"], dialog[open]') !== null;
}

function ToastCard({
  notice,
  onUndo,
  onDismiss,
  onRecover,
}: {
  notice: SaveNotice;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  onRecover: (action: "refresh" | "history" | "budgets") => void | Promise<void>;
}) {
  const [held, setHeld] = useState({ pointer: false, focus: false });
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const paused = held.pointer || held.focus;
  const cardRef = useRef<HTMLDivElement>(null);
  // Tracking the notice being dismissed lets a newer notice replace it mid-exit.
  const [leavingNotice, setLeavingNotice] = useState<SaveNotice | null>(null);
  const leaving = leavingNotice === notice;

  useEffect(() => {
    if (paused || leaving || working || notice.tone === "warning") return;
    const timer = window.setTimeout(
      () => setLeavingNotice(notice),
      notice.undo ? undoMs : messageMs,
    );
    return () => window.clearTimeout(timer);
  }, [notice, paused, leaving, working]);

  const act = async (action: () => void | Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  };

  // Hovering or focusing the toast holds it open so Undo is never pulled away mid-reach.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const pointerEnter = () => setHeld((current) => ({ ...current, pointer: true }));
    const pointerLeave = () => setHeld((current) => ({ ...current, pointer: false }));
    const focusIn = () => setHeld((current) => ({ ...current, focus: true }));
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      setHeld((current) => ({ ...current, focus: false }));
    };
    const events = [
      ["pointerenter", pointerEnter],
      ["focusin", focusIn],
      ["pointerleave", pointerLeave],
    ] as const;
    for (const [name, handler] of events) card.addEventListener(name, handler);
    card.addEventListener("focusout", focusOut);
    return () => {
      for (const [name, handler] of events) card.removeEventListener(name, handler);
      card.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <div
      className={styles.toast}
      data-leaving={leaving}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && leaving) onDismiss();
      }}
      ref={cardRef}
    >
      <span aria-hidden className={styles.mark} data-tone={notice.tone ?? "success"}>
        <Icon name={notice.tone === "warning" ? "info" : "check"} strokeWidth={2.6} />
      </span>
      <p className={styles.message}>{notice.message}</p>
      {notice.undo ? (
        <Button
          className={styles.undo}
          isDisabled={working}
          onPress={() => void act(onUndo)}
          type="button"
          variant="ghost"
        >
          {working ? "Undoing…" : "Undo"}
        </Button>
      ) : null}
      {notice.recovery ? (
        <Button
          className={styles.undo}
          isDisabled={working}
          onPress={() =>
            void act(() => onRecover(notice.recovery as "refresh" | "history" | "budgets"))
          }
          variant="ghost"
        >
          {working ? "Checking…" : recoveryLabels[notice.recovery]}
        </Button>
      ) : null}
      <Button
        aria-label="Dismiss message"
        className={styles.close}
        isDisabled={working}
        onPress={() => setLeavingNotice(notice)}
        type="button"
        variant="ghost"
      >
        <Icon name="close" strokeWidth={2.4} />
      </Button>
    </div>
  );
}

// The live region stays mounted so assistive technology announces each message as it appears.
export function SessionToast({
  notice,
  onUndo,
  onDismiss,
  onRecover,
}: {
  notice: SaveNotice | null;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  onRecover: (action: "refresh" | "history" | "budgets") => void | Promise<void>;
}) {
  // Modal focus containment makes outside actions unreachable. Start the toast's
  // display and Undo window when the modal closes, keeping the result available.
  const deferred = useSyncExternalStore(subscribeToDialogs, dialogIsOpen, () => false);
  return (
    <div aria-live="polite" className={styles.layer} role="status">
      {notice && !deferred ? (
        <ToastCard notice={notice} onDismiss={onDismiss} onUndo={onUndo} onRecover={onRecover} />
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import styles from "@/components/session-toast.module.css";
import type { SaveNotice } from "@/components/use-monara-session";

// An Undo needs time to be noticed and used, so it stays up longer than a plain confirmation.
const messageMs = 5_000;
const undoMs = 9_000;

function ToastCard({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: SaveNotice;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // Tracking the notice being dismissed lets a newer notice replace it mid-exit.
  const [leavingNotice, setLeavingNotice] = useState<SaveNotice | null>(null);
  const leaving = leavingNotice === notice;

  useEffect(() => {
    if (paused || leaving) return;
    const timer = window.setTimeout(
      () => setLeavingNotice(notice),
      notice.undo ? undoMs : messageMs,
    );
    return () => window.clearTimeout(timer);
  }, [notice, paused, leaving]);

  // Hovering or focusing the toast holds it open so Undo is never pulled away mid-reach.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const hold = () => setPaused(true);
    const release = () => setPaused(false);
    const events = [
      ["pointerenter", hold],
      ["focusin", hold],
      ["pointerleave", release],
      ["focusout", release],
    ] as const;
    for (const [name, handler] of events) card.addEventListener(name, handler);
    return () => {
      for (const [name, handler] of events) card.removeEventListener(name, handler);
    };
  }, []);

  return (
    <div
      className={styles.toast}
      data-leaving={leaving}
      onAnimationEnd={() => {
        if (leaving) onDismiss();
      }}
      ref={cardRef}
    >
      <span aria-hidden className={styles.mark}>
        <Icon name="check" strokeWidth={2.6} />
      </span>
      <p className={styles.message}>{notice.message}</p>
      {notice.undo ? (
        <button className={styles.undo} onClick={onUndo} type="button">
          Undo
        </button>
      ) : null}
      <button
        aria-label="Dismiss message"
        className={styles.close}
        onClick={() => setLeavingNotice(notice)}
        type="button"
      >
        <Icon name="close" strokeWidth={2.4} />
      </button>
    </div>
  );
}

// The live region stays mounted so assistive technology announces each message as it appears.
export function SessionToast({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: SaveNotice | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div aria-live="polite" className={styles.layer} role="status">
      {notice ? <ToastCard notice={notice} onDismiss={onDismiss} onUndo={onUndo} /> : null}
    </div>
  );
}

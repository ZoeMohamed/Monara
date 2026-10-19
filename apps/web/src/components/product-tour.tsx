"use client";

import { useLayoutEffect, useRef, useState } from "react";

import styles from "./product-tour.module.css";
import { type TourMode, writeTourSeen } from "./use-product-tour";

type TourStep = { target: string; title: string; body: string };

// Four stops on the real Home screen: what counts, what is coming, how to ask, how to add.
const steps: TourStep[] = [
  {
    target: "balance",
    title: "Your month so far",
    body: "Only payments you've confirmed count here. Tap the eye to hide amounts.",
  },
  {
    target: "forecast",
    title: "What's coming",
    body: "Monara looks at your repeating payments and shows what to expect before the month ends, with how sure it is.",
  },
  {
    target: "ask",
    title: "Ask Monara",
    body: "Ask how you're doing, like “Where did it go?” or “Can I afford a 300k dinner?”",
  },
  {
    target: "add",
    title: "Add in seconds",
    body: "Paid cash? Log it here, or just tell Monara “kopi 25rb”.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };
type Placement = { rect: Rect | null; top: number; left: number | null };

const bubbleWidth = 420;

function visibleTarget(target: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return element;
  }
  return null;
}

export function ProductTour({ mode, onFinish }: { mode: TourMode; onFinish?: () => void }) {
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bubbleRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const available = ready ? steps.filter((step) => visibleTarget(step.target)) : [];
  const step = available[Math.min(index, available.length - 1)];
  const hasStep = Boolean(step);
  const last = index >= available.length - 1;

  const finish = () => {
    writeTourSeen(mode, true);
    onFinish?.();
  };

  // The route may still be streaming when the shell first mounts the tour.
  useLayoutEffect(() => {
    const observer = new MutationObserver(check);
    function check() {
      if (visibleTarget("balance") && visibleTarget("ask") && visibleTarget("add")) {
        setReady(true);
        observer.disconnect();
      }
    }
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", check);
    check();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  // Native modality keeps focus in the tour and prevents actions on the dimmed page.
  useLayoutEffect(() => {
    if (!hasStep) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    primaryRef.current?.focus({ preventScroll: true });
    return () => dialog.close();
  }, [hasStep]);

  // Follow the target without letting the explanation fall outside a small viewport.
  useLayoutEffect(() => {
    if (!step) return;
    const target = step.target;
    const element = visibleTarget(target);
    if (element && target !== "add") {
      element.scrollIntoView({ block: "center", behavior: "instant" });
    }
    const update = () => {
      const box = visibleTarget(target)?.getBoundingClientRect();
      const rect = box
        ? { top: box.top, left: box.left, width: box.width, height: box.height }
        : null;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const bubbleHeight = bubbleRef.current?.offsetHeight ?? 200;
      const below = rect ? rect.top + rect.height + 22 : viewportTop + 32;
      const above = rect ? rect.top - bubbleHeight - 22 : below;
      const preferred = below + bubbleHeight <= viewportBottom - 16 ? below : above;
      const top = Math.max(
        viewportTop + 16,
        Math.min(preferred, viewportBottom - bubbleHeight - 16),
      );
      // Wide screens anchor the explanation beside its target instead of centring it.
      const left =
        rect && window.innerWidth >= 1024
          ? Math.max(16, Math.min(rect.left, window.innerWidth - bubbleWidth - 16))
          : null;
      setPlacement({ rect, top, left });
    };
    update();
    const observer = new ResizeObserver(update);
    if (element) observer.observe(element);
    if (bubbleRef.current) observer.observe(bubbleRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [step]);

  if (!step) return null;

  const pad = 8;
  const rect = placement?.rect;

  return (
    <dialog
      aria-describedby="tour-body"
      aria-labelledby="tour-title"
      className={styles.layer}
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
      ref={dialogRef}
    >
      {rect ? (
        <div
          aria-hidden
          className={styles.spotlight}
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div aria-hidden className={styles.dim} />
      )}
      <section
        className={styles.bubble}
        ref={bubbleRef}
        style={
          placement
            ? {
                top: placement.top,
                ...(placement.left === null
                  ? {}
                  : { left: placement.left, right: "auto", marginInline: 0, width: bubbleWidth }),
              }
            : { bottom: 120 }
        }
      >
        <div aria-live="polite">
          <p className={styles.progress}>
            {Math.min(index, available.length - 1) + 1} of {available.length}
          </p>
          <h2 id="tour-title">{step.title}</h2>
          <p id="tour-body">{step.body}</p>
        </div>
        <div className={styles.actions}>
          <button
            aria-label="Skip introduction"
            className={styles.skip}
            onClick={finish}
            type="button"
          >
            Skip
          </button>
          <div className={styles.navigation}>
            {index > 0 ? (
              <button
                className={styles.back}
                onClick={() => setIndex((value) => value - 1)}
                type="button"
              >
                Back
              </button>
            ) : null}
            <button
              className={styles.next}
              onClick={() => (last ? finish() : setIndex((value) => value + 1))}
              ref={primaryRef}
              type="button"
            >
              {last ? "Explore" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </dialog>
  );
}

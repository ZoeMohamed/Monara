"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Reveals text a few characters at a time, quickly and a little unevenly, the way a
 * model streams a reply. People who ask for less motion get the whole text at once.
 */
export function useStreamedText(text: string, startDelayMs = 450) {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let shown = 0;
    let timer: number | undefined;
    const tick = () => {
      shown = Math.min(text.length, shown + 1 + Math.floor(Math.random() * 3));
      setCount(shown);
      if (shown < text.length) timer = window.setTimeout(tick, 16 + Math.random() * 22);
    };
    timer = window.setTimeout(tick, startDelayMs);
    return () => window.clearTimeout(timer);
  }, [text, reduced, startDelayMs]);

  const visible = reduced ? text : text.slice(0, count);
  return { visible, started: visible.length > 0, done: visible.length === text.length };
}

"use client";

import { useSyncExternalStore } from "react";
import {
  type BrandLogo,
  brandLabelKey,
  brandLogoFromChoice,
  institutionBrand,
  merchantBrand,
} from "@/data/brand-identity";

// Per-name logo choices are a display preference kept in this browser. They never change
// a transaction, account or provider identity, so they hold no financial data.
const storageKey = "monara.brand-logos.v1";
type Choices = Readonly<Record<string, string>>;

const none: Choices = {};
let cache: Choices | null = null;
const listeners = new Set<() => void>();

function readChoices(): Choices {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    cache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" &&
                (entry[1] === "none" || brandLogoFromChoice(entry[1]) !== undefined),
            ),
          )
        : none;
  } catch {
    cache = none;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const external = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", external);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", external);
  };
}

/** "none" hides a detected logo; null returns the name to automatic detection. */
export function setBrandLogoChoice(label: string, choice: string | null) {
  const key = brandLabelKey(label);
  if (!key) return;
  const next = { ...readChoices() };
  if (choice === null) delete next[key];
  else next[key] = choice;
  cache = next;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Private browsing can refuse storage; the choice still applies for this visit.
  }
  for (const listener of listeners) listener();
}

export function useBrandLogoChoice(label: string | null | undefined): string | undefined {
  const choices = useSyncExternalStore(subscribe, readChoices, () => none);
  const key = brandLabelKey(label);
  return key ? choices[key] : undefined;
}

function resolved(choice: string | undefined, detected: BrandLogo | undefined) {
  if (choice === "none") return undefined;
  return brandLogoFromChoice(choice) ?? detected;
}

export function useMerchantLogo(merchant: string | null | undefined) {
  return resolved(useBrandLogoChoice(merchant), merchantBrand(merchant));
}

export function useInstitutionLogo(institution: string | null | undefined) {
  return resolved(useBrandLogoChoice(institution), institutionBrand(institution));
}

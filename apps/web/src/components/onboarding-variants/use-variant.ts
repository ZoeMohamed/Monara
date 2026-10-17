"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { allVariants, defaultVariant, parseVariant, type VariantId } from "./variants";

/** The active variant lives in the URL, so every variant is a link. */
export function useVariant() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("__variant");
  const active = parseVariant(requested) ?? defaultVariant;

  const setVariant = useCallback(
    (id: VariantId) => {
      const next = new URLSearchParams(window.location.search);
      next.set("__variant", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const index = allVariants.findIndex((variant) => variant.id === active);
      const next = allVariants[(index + direction + allVariants.length) % allVariants.length];
      if (next) setVariant(next.id);
    },
    [active, setVariant],
  );

  return { active, requested: requested !== null, setVariant, step };
}

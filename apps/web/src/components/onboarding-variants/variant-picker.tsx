"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useVariant } from "./use-variant";
import styles from "./variant-picker.module.css";
import { type VariantId, variantGroups } from "./variants";

const arrow = (
  <svg
    aria-hidden="true"
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    viewBox="0 0 16 16"
    width="12"
  >
    <path d="M3 3v4a3 3 0 0 0 3 3h7" />
    <path d="m10 7 3 3-3 3" />
  </svg>
);

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Switches the import step between its variants. Arrow keys step through; H hides it. */
export function VariantPicker() {
  const { active, setVariant, step } = useVariant();
  const [hidden, setHidden] = useState(false);
  const headingId = useId();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (typing(event.target)) return;
      if (event.key === "h" || event.key === "H") setHidden((value) => !value);
      else if (event.key === "ArrowDown" || event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") step(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  if (hidden) return null;
  return (
    <div className={styles.page}>
      <nav aria-label="Variants" className={styles.picker}>
        {variantGroups.map((group) => (
          // biome-ignore lint/a11y/useSemanticElements: the picker spec asks for a labelled group, not a fieldset
          <div
            aria-labelledby={`${headingId}-${group.heading}`}
            className={styles.group}
            key={group.heading}
            role="group"
          >
            <span className={styles.heading} id={`${headingId}-${group.heading}`}>
              {arrow}
              {group.heading}
            </span>
            {group.variants.map((variant) => (
              <button
                aria-pressed={active === variant.id}
                data-variant={variant.id}
                key={variant.id}
                onClick={() => setVariant(variant.id)}
                ref={active === variant.id ? activeRef : undefined}
                type="button"
              >
                {variant.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.select}>
        <select
          aria-label="Variant"
          onChange={(event) => setVariant(event.target.value as VariantId)}
          value={active}
        >
          {variantGroups.map((group) => (
            <optgroup key={group.heading} label={group.heading}>
              {group.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <svg
          aria-hidden="true"
          fill="none"
          height="12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 16 16"
          width="12"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
    </div>
  );
}

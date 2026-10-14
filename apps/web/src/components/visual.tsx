import type { CSSProperties, ReactNode } from "react";

import styles from "./visual.module.css";

// Shared section heading and summary surface. Kept deliberately plain: data carries the colour.
export type Tone = "blue" | "green" | "violet" | "amber" | "rose";

const toneColors: Record<Tone, string> = {
  blue: "var(--accent)",
  green: "var(--success)",
  violet: "#8870c9",
  amber: "#d99a1e",
  rose: "var(--danger)",
};

export function SectionTitle({
  id,
  title,
  meta,
  action,
}: {
  id?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.sectionTitle}>
      <h2 className={styles.titleText} id={id}>
        {title}
      </h2>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
      {action}
    </div>
  );
}

// A flat, faintly tinted surface for headline summaries.
export function Wash({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${styles.wash} ${className}`}
      style={{ "--tone": toneColors[tone] } as CSSProperties}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

import styles from "./visual.module.css";

// Shared section heading. Kept deliberately plain: data carries the colour.
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

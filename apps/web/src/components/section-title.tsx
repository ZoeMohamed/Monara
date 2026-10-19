import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import styles from "./section-title.module.css";

function Mark({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <>
      <span aria-hidden className={styles.icon}>
        <Icon name={icon} strokeWidth={2.1} />
      </span>
      <span className={styles.text}>
        {children}
        <svg aria-hidden className={styles.swoosh} preserveAspectRatio="none" viewBox="0 0 120 8">
          <path d="M1 6.6C30 2.2 68 1 119 3.1 77 3.5 37 4.8 1 6.6Z" />
        </svg>
      </span>
    </>
  );
}

/**
 * The title of a Home section: an icon tile, the name, and a hand-drawn swoosh under the name. One
 * component, so every section reads the same. The icon is decoration; the text names the section.
 */
export function SectionTitle({
  id,
  icon,
  className,
  children,
}: {
  id?: string;
  icon: IconName;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2 className={className ? `${styles.title} ${className}` : styles.title} id={id}>
      <Mark icon={icon}>{children}</Mark>
    </h2>
  );
}

/** The same title for a section that is one big button, where a heading would be wrong. */
export function SectionLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className={styles.title}>
      <Mark icon={icon}>{children}</Mark>
    </span>
  );
}

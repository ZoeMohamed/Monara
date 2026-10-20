import styles from "@/components/app-loading.module.css";

/** Shared feedback while the signed-in app and its first-run state are being checked. */
export function AppLoading({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={overlay ? styles.overlay : styles.page} role="status">
      <div className={styles.indicator}>
        <span aria-hidden className={styles.spinner} />
        <p>Getting things ready…</p>
      </div>
    </div>
  );
}

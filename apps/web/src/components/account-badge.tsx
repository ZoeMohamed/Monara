import type { FinancialAccount } from "@monara/contracts";
import type { CSSProperties } from "react";

import styles from "@/components/account-badge.module.css";
import { Icon } from "@/components/icon";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// A saved account's explicit type chooses its glyph. Names never imply a bank or wallet.
export function AccountBadge({
  name,
  account,
  size = 40,
}: {
  name: string | null;
  account?: Pick<FinancialAccount, "name" | "institution" | "accountType">;
  size?: number;
}) {
  const dimension = { "--badge-size": `${size}px` } as CSSProperties;
  const label = (account?.institution ?? name)?.trim();
  if (!label) {
    return (
      <span aria-hidden className={styles.badge} data-kind="unknown" style={dimension}>
        <Icon name="question" />
      </span>
    );
  }
  const kind = account?.accountType ?? (/^(cash|tunai)$/i.test(label) ? "cash" : undefined);
  if (kind) {
    return (
      <span aria-hidden className={styles.badge} data-kind={kind} style={dimension}>
        <Icon name={kind === "bank" ? "bank" : kind === "wallet" ? "wallet" : "cash"} />
      </span>
    );
  }
  return (
    <span aria-hidden className={styles.badge} data-kind="unknown" style={dimension}>
      {initials(label)}
    </span>
  );
}

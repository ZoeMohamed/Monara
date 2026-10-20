import type { FinancialAccount } from "@monara/contracts";
import type { CSSProperties } from "react";

import styles from "@/components/account-badge.module.css";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { useInstitutionLogo } from "@/components/use-brand-logo";
import { brandLogoFromChoice, brands } from "@/data/brand-identity";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

type BadgeAccount = Pick<
  FinancialAccount,
  "name" | "institution" | "accountType" | "institutionLogo"
>;

function useAccountVisual(name: string | null, account?: BadgeAccount) {
  const label = (account?.institution ?? name)?.trim();
  const local = useInstitutionLogo(account ? account.institution : name);
  const candidate =
    account?.institutionLogo === null
      ? undefined
      : (brandLogoFromChoice(account?.institutionLogo) ?? local);
  // A registered bank never decorates a wallet (or the reverse); picked catalog logos follow the user.
  const registered =
    candidate && !candidate.startsWith("si:")
      ? brands[candidate as keyof typeof brands]
      : undefined;
  const brand =
    account?.institutionLogo || !account || !registered || account.accountType === registered.kind
      ? candidate
      : undefined;
  const kind = account?.accountType ?? (/^(cash|tunai)$/i.test(label ?? "") ? "cash" : undefined);
  return { label, brand, kind };
}

// Exact provider names choose artwork only; the saved type and identity stay unchanged.
export function AccountBadge({
  name,
  account,
  size = 40,
}: {
  name: string | null;
  account?: BadgeAccount;
  size?: number;
}) {
  const dimension = { "--badge-size": `${size}px` } as CSSProperties;
  const { label, brand, kind } = useAccountVisual(name, account);
  if (brand) return <BrandMark brand={brand} size={size} />;
  if (!label) {
    return (
      <span aria-hidden className={styles.badge} data-kind="unknown" style={dimension}>
        <Icon name="question" />
      </span>
    );
  }
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

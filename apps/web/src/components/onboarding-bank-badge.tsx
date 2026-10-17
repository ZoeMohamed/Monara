import { AccountBadge } from "@/components/account-badge";

/** A bank's logo from its provider name: the registry's brand art, or a generic bank mark. */
export function BankBadge({
  provider,
  name,
  platform,
  size = 40,
}: {
  provider: string;
  name: string;
  platform: string;
  size?: number;
}) {
  return (
    <AccountBadge
      account={{
        name,
        institution: provider,
        accountType: platform === "E_WALLET" ? "wallet" : "bank",
      }}
      name={provider}
      size={size}
    />
  );
}

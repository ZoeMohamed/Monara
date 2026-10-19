import { isHolderName } from "@monara/contracts";

export { isHolderName };

/** A matching counterparty name establishes Internal independently of email semantics. */
export function applyHolderRules<
  T extends {
    kind: string | null;
    counterpartyName: string | null;
    flowDirection?: "in" | "out" | null;
    isTransfer?: boolean;
    internalTransfer?: boolean;
    counterpartyType?: "business" | "person" | "unknown";
  },
>(items: readonly T[], holderName: string | null): T[] {
  return items.map((item) => {
    const internalTransfer = Boolean(
      holderName && item.counterpartyName && isHolderName(item.counterpartyName, holderName),
    );
    return {
      ...item,
      internalTransfer,
      ...(internalTransfer
        ? {
            kind: "exclusion",
            flowDirection:
              item.kind === "expense" ? "out" : item.kind === "income" ? "in" : item.flowDirection,
          }
        : {}),
    };
  });
}

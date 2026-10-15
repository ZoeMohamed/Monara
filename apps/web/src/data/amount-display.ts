import { formatRupiah } from "./demo-ledger.ts";
import { compactAmount } from "./finance-analytics.ts";

const hiddenAmount = "••••••";

/** Mask presentation text only; calculations and saved money keep their exact values. */
export function amountDisplay(hidden: boolean) {
  return {
    formatRupiah: (value: number | bigint) => (hidden ? hiddenAmount : formatRupiah(value)),
    compactAmount: (value: bigint, showFraction = true) =>
      hidden ? hiddenAmount : compactAmount(value, showFraction),
    maskAmountText: (text: string) =>
      hidden
        ? text.replace(
            /\b(?:Rp|IDR)\s*[−-]?\d(?:[\d.,]*\d)?(?:\s?(?:rb|ribu|juta|[kmbt])\b)?|\b\d+(?:[.,]\d+)?\s?(?:rb|ribu|juta|[kmbt])\b/gi,
            hiddenAmount,
          )
        : text,
  };
}

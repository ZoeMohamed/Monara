"use client";

import { Button, Card } from "@monara/ui";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { categoryIcon } from "@/data/category-style";
import { formatRupiah, type RecurringBill } from "@/data/demo-ledger";

export function RecurringBillSuggestion({
  bill,
  onConfirm,
  onDismiss,
}: {
  bill: RecurringBill;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const glyph = categoryIcon(bill.merchant);
  const brand = useMerchantLogo(bill.merchant);
  return (
    <Card className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-4 rounded-[1.25rem] border border-accent/20 bg-accent-soft/30 p-5">
      {brand ? (
        <BrandMark brand={brand} />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-[.875rem] bg-accent-soft text-accent-soft-foreground">
          <Icon className="h-5 w-5" name={glyph === "dot" ? "bills" : glyph} />
        </span>
      )}
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <h4 className="text-sm font-bold">{bill.merchant}</h4>
        <p className="mt-1 text-xs text-muted">
          <strong className="font-semibold text-foreground tabular-nums">
            {formatRupiah(bill.expectedAmount)}
          </strong>{" "}
          / month · Suggested bill
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            aria-label={`Track ${bill.merchant} bill`}
            className="min-h-11 rounded-full px-4 text-xs"
            onPress={() => onConfirm(bill.id)}
          >
            <Icon className="h-4 w-4" name="check" />
            Track bill
          </Button>
          <Button
            aria-label={`Dismiss ${bill.merchant} bill suggestion`}
            className="min-h-11 rounded-full px-4 text-xs"
            onPress={() => onDismiss(bill.id)}
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Card>
  );
}

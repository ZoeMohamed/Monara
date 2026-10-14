"use client";

import { Button } from "@monara/ui";

import { Icon } from "@/components/icon";
import { demoMonth, formatMonth, shiftMonth } from "@/data/demo-ledger";

const oldestMonth = shiftMonth(demoMonth, -12);

export function MonthSelector({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <fieldset
      aria-label="Selected month"
      className="flex items-center rounded-full border border-border bg-surface p-0.5"
    >
      <Button
        aria-label="Previous month"
        className="shrink-0 rounded-full"
        isDisabled={month <= oldestMonth}
        isIconOnly
        onPress={() => onChange(shiftMonth(month, -1))}
        variant="ghost"
      >
        <Icon name="chevron-left" />
      </Button>
      <span
        aria-live="polite"
        className="min-w-0 px-1 text-center text-xs font-bold sm:px-3 sm:text-sm"
      >
        {formatMonth(month)}
      </span>
      <Button
        aria-label="Next month"
        className="shrink-0 rounded-full"
        isDisabled={month >= demoMonth}
        isIconOnly
        onPress={() => onChange(shiftMonth(month, 1))}
        variant="ghost"
      >
        <Icon name="chevron-right" />
      </Button>
    </fieldset>
  );
}

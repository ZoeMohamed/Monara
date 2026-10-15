"use client";

import { Button } from "@monara/ui";

import { Icon } from "@/components/icon";
import styles from "@/components/period-selector.module.css";
import { demoMonth, formatMonth, shiftMonth } from "@/data/demo-ledger";

export function MonthSelector({
  month,
  onChange,
  currentMonth = demoMonth,
}: {
  month: string;
  onChange: (month: string) => void;
  currentMonth?: string;
}) {
  const oldestMonth = shiftMonth(currentMonth, -12);
  return (
    <fieldset aria-label="Selected month" className={styles.selector}>
      <Button
        aria-label="Previous month"
        className={styles.arrow}
        isDisabled={month <= oldestMonth}
        isIconOnly
        onPress={() => onChange(shiftMonth(month, -1))}
        variant="ghost"
      >
        <Icon name="chevron-left" />
      </Button>
      <span aria-live="polite" className={styles.label}>
        {formatMonth(month)}
      </span>
      <Button
        aria-label="Next month"
        className={styles.arrow}
        isDisabled={month >= currentMonth}
        isIconOnly
        onPress={() => onChange(shiftMonth(month, 1))}
        variant="ghost"
      >
        <Icon name="chevron-right" />
      </Button>
    </fieldset>
  );
}

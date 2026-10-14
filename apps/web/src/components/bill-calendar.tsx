"use client";

import { Button, Card } from "@monara/ui";
import { useState } from "react";

import { Icon } from "@/components/icon";
import { SectionTitle } from "@/components/visual";
import {
  daysInMonth,
  demoToday,
  formatMonth,
  formatRupiah,
  type RecurringBill,
  shiftMonth,
} from "@/data/demo-ledger";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function initialDate(month: string, bills: RecurringBill[]): string {
  return bills.find((bill) => bill.nextDue.startsWith(`${month}-`))?.nextDue ?? `${month}-01`;
}

export function BillCalendar({
  bills,
  month,
  today = demoToday,
}: {
  bills: RecurringBill[];
  month: string;
  today?: string;
}) {
  const [calendar, setCalendar] = useState(() => ({ month, date: initialDate(month, bills) }));
  const monthBills = bills.filter((bill) => bill.nextDue.startsWith(`${calendar.month}-`));
  const selectedBills = monthBills.filter((bill) => bill.nextDue === calendar.date);
  const firstWeekday = (new Date(`${calendar.month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const total = monthBills.reduce((sum, bill) => sum + BigInt(bill.expectedAmount), BigInt(0));

  function navigateMonth(delta: number) {
    const nextMonth = shiftMonth(calendar.month, delta);
    setCalendar({ month: nextMonth, date: initialDate(nextMonth, bills) });
  }

  return (
    <section aria-labelledby="bill-calendar-heading" className="min-w-0">
      <SectionTitle id="bill-calendar-heading" title="Bill calendar" />
      <Card className="mt-2 block min-w-0 gap-0 rounded-2xl border border-border p-4 min-[400px]:p-5">
        <div className="flex items-center justify-between gap-1">
          <Button
            aria-label={`Previous bill month, ${formatMonth(shiftMonth(calendar.month, -1))}`}
            className="h-11 w-11 shrink-0"
            isIconOnly
            onPress={() => navigateMonth(-1)}
            variant="tertiary"
          >
            <Icon name="chevron-left" />
          </Button>
          <p aria-live="polite" className="min-w-0 text-center text-sm font-bold">
            {formatMonth(calendar.month)}
          </p>
          <Button
            aria-label={`Next bill month, ${formatMonth(shiftMonth(calendar.month, 1))}`}
            className="h-11 w-11 shrink-0"
            isIconOnly
            onPress={() => navigateMonth(1)}
            variant="tertiary"
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <p className="min-w-0 text-muted tabular-nums [overflow-wrap:anywhere]">
            {monthBills.length} {monthBills.length === 1 ? "bill" : "bills"} ·{" "}
            <span className="font-semibold text-foreground">{formatRupiah(total)}</span>
          </p>
          <Button
            className="min-h-11 px-2 text-xs"
            onPress={() => setCalendar({ month: today.slice(0, 7), date: today })}
            size="sm"
            variant="tertiary"
          >
            This month
          </Button>
        </div>
        <div aria-hidden className="mt-2 grid grid-cols-7 gap-0.5 min-[400px]:gap-1">
          {weekdayLabels.map((label) => (
            <span className="py-1 text-center text-xs font-semibold text-muted" key={label}>
              {label}
            </span>
          ))}
        </div>
        <fieldset
          aria-label={`Bill dates in ${formatMonth(calendar.month)}`}
          className="mt-1 grid min-w-0 grid-cols-7 gap-0.5 min-[400px]:gap-1"
        >
          {weekdayLabels.slice(0, firstWeekday).map((weekday) => (
            <span aria-hidden key={`blank-${weekday}`} />
          ))}
          {Array.from({ length: daysInMonth(calendar.month) }, (_, index) => {
            const day = index + 1;
            const date = `${calendar.month}-${String(day).padStart(2, "0")}`;
            const dayBills = monthBills.filter((bill) => bill.nextDue === date);
            const selected = calendar.date === date;
            const isToday = date === today;
            const label = dateFormatter.format(new Date(`${date}T00:00:00Z`));
            return (
              <Button
                aria-current={isToday ? "date" : undefined}
                aria-label={`${label}${isToday ? ", today" : ""}, ${dayBills.length} ${dayBills.length === 1 ? "bill" : "bills"}`}
                aria-pressed={selected}
                className={`relative h-11 min-h-11 w-full min-w-0 rounded-lg border p-0 text-xs tabular-nums ${
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : dayBills.length > 0
                      ? "border-accent/20 bg-accent-soft text-accent-soft-foreground"
                      : isToday
                        ? "border-accent bg-surface text-foreground"
                        : "border-transparent bg-surface-secondary/60 text-muted"
                }`}
                key={date}
                onPress={() => setCalendar({ month: calendar.month, date })}
                variant="tertiary"
              >
                <span aria-hidden className="font-bold">
                  {day}
                </span>
                {dayBills.length > 0 ? (
                  <span
                    aria-hidden
                    className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-accent-foreground" : "bg-accent"}`}
                  />
                ) : null}
              </Button>
            );
          })}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" /> Bill due
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded border border-accent" /> Today
          </span>
        </div>
        <div aria-live="polite" className="mt-4 border-t border-separator pt-3">
          <p className="text-xs font-semibold text-muted">
            {dateFormatter.format(new Date(`${calendar.date}T00:00:00Z`))}
          </p>
          {selectedBills.length > 0 ? (
            <ul className="mt-1 divide-y divide-separator">
              {selectedBills.map((bill) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
                  key={bill.id}
                >
                  <span className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">
                    <span aria-hidden className="mr-1.5">
                      {bill.emoji}
                    </span>
                    {bill.merchant}
                  </span>
                  <span className="min-w-0 text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {formatRupiah(bill.expectedAmount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No bills due.</p>
          )}
        </div>
      </Card>
    </section>
  );
}

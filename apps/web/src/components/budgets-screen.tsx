"use client";

import { Button, Card, Chip, ProgressBar } from "@monara/ui";

import { Icon } from "@/components/icon";
import {
  type Budget,
  daysBetween,
  demoMonth,
  demoToday,
  formatDay,
  formatMonth,
  formatRupiah,
  type RecurringBill,
  safeToSpendToday,
  type Transaction,
} from "@/data/demo-ledger";

const fillByState = {
  "on-track": "bg-accent",
  warning: "bg-warning",
  over: "bg-danger",
} as const;

function BudgetRow({
  usage,
  daysLeft,
}: {
  usage: ReturnType<typeof safeToSpendToday>["perCategory"][number];
  daysLeft: number;
}) {
  const { budget } = usage;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary">
          {budget.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-words text-sm font-bold">{budget.category}</p>
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-sm font-bold tabular-nums">
              {usage.state === "over" ? (
                <Chip color="danger" size="sm" variant="soft">
                  Over budget
                </Chip>
              ) : usage.state === "warning" ? (
                <Chip color="warning" size="sm" variant="soft">
                  Near limit
                </Chip>
              ) : null}
              {usage.percent}%
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-xs tabular-nums">
            <span className="min-w-0 break-words text-muted">
              {formatRupiah(usage.used)} of {formatRupiah(usage.limit)}
            </span>
            <span
              className={`ml-auto min-w-0 break-words ${usage.state === "over" ? "font-semibold text-danger" : "text-muted"}`}
            >
              {usage.state === "over"
                ? `${formatRupiah(-usage.remaining)} over`
                : `${formatRupiah(usage.remaining)} left`}
            </span>
          </div>
          <p className="mt-1 break-words text-xs text-muted tabular-nums">
            Safe today: {formatRupiah(usage.perDay)} · {formatRupiah(usage.available)} ÷ {daysLeft}{" "}
            {daysLeft === 1 ? "day" : "days"}
          </p>
        </div>
      </div>
      <ProgressBar
        aria-label={`${budget.category} budget used`}
        className="mt-2"
        value={Math.min(usage.percent, 100)}
      >
        <ProgressBar.Track className="h-1.5 bg-surface-tertiary">
          <ProgressBar.Fill className={fillByState[usage.state]} />
        </ProgressBar.Track>
      </ProgressBar>
    </li>
  );
}

function BillRow({ bill }: { bill: RecurringBill }) {
  const daysUntil = daysBetween(demoToday, bill.nextDue);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary">
        {bill.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{bill.merchant}</p>
        <p className="mt-0.5 text-xs text-muted">
          Monthly · due {formatDay(bill.nextDue)}
          {bill.cancellationUrl ? (
            <>
              {" · "}
              <a
                className="inline-flex items-center gap-0.5 font-semibold text-link underline-offset-2 hover:underline"
                href={bill.cancellationUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                How to cancel
                <Icon className="h-3 w-3" name="external" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </>
          ) : null}
        </p>
      </div>
      <div className="ml-auto min-w-0 max-w-full text-right">
        <p className="break-words text-sm font-bold tabular-nums">
          {formatRupiah(bill.expectedAmount)}
        </p>
        {daysUntil >= 0 && daysUntil <= 3 ? (
          <Chip className="mt-0.5" color="warning" size="sm" variant="soft">
            {daysUntil === 0 ? "Due today" : `In ${daysUntil} ${daysUntil === 1 ? "day" : "days"}`}
          </Chip>
        ) : null}
      </div>
    </li>
  );
}

export function BudgetsScreen({
  transactions,
  budgets,
  bills,
  onConfirmBill,
  onDismissBill,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  bills: RecurringBill[];
  onConfirmBill: (id: string) => void;
  onDismissBill: (id: string) => void;
}) {
  const safe = safeToSpendToday(transactions, budgets);
  const suggested = bills.filter((bill) => bill.status === "suggested");
  const active = bills
    .filter((bill) => bill.status === "active")
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));

  return (
    <div>
      <p className="text-xs font-semibold text-muted sm:text-sm">{formatMonth(demoMonth)}</p>
      <h1 className="mt-0.5 text-2xl font-black tracking-[-0.05em] sm:text-4xl">Budgets</h1>

      <Card className="mt-3 block gap-0 rounded-2xl bg-accent-soft p-4">
        <p className="text-xs font-semibold text-accent-soft-foreground">Safe to spend today</p>
        <p className="mt-1 break-words text-[1.75rem] font-black leading-tight tracking-[-0.05em] tabular-nums">
          {formatRupiah(safe.perDay)}
        </p>
        <p className="mt-1 break-words text-xs text-accent-soft-foreground tabular-nums">
          {formatRupiah(safe.limit)} total budget − {formatRupiah(safe.spending)} confirmed spending
        </p>
        <p className="mt-1 break-words text-xs text-accent-soft-foreground tabular-nums">
          {formatRupiah(safe.remaining)} available ÷ {safe.daysLeft}{" "}
          {safe.daysLeft === 1 ? "day" : "days"} left, including today
        </p>
        {safe.shortfall > BigInt(0) ? (
          <p className="mt-1 break-words text-xs font-semibold text-danger tabular-nums">
            {formatRupiah(safe.shortfall)} over the total budget. No budget available today.
          </p>
        ) : null}
      </Card>

      <section aria-labelledby="category-budgets" className="mt-5">
        <h2 id="category-budgets" className="text-base font-black tracking-[-0.03em]">
          Category budgets
        </h2>
        <Card className="mt-2 block gap-0 rounded-2xl border border-border px-4 py-1">
          <ul className="divide-y divide-separator">
            {safe.perCategory.map((usage) => (
              <BudgetRow daysLeft={safe.daysLeft} key={usage.budget.id} usage={usage} />
            ))}
          </ul>
        </Card>
        <p className="mt-2 text-xs text-muted">
          Confirmed expenses only. Warnings at 80% and 100%. Editing budgets opens when budget
          storage is ready.
        </p>
      </section>

      <section aria-labelledby="recurring-bills" className="mt-5">
        <h2 id="recurring-bills" className="text-base font-black tracking-[-0.03em]">
          Recurring bills
        </h2>
        {suggested.map((bill) => (
          <Card
            className="mt-2 block gap-0 rounded-2xl border border-accent/30 bg-surface p-4"
            key={bill.id}
          >
            <p className="text-xs font-semibold text-accent-soft-foreground">
              Detected from your payments
            </p>
            <p className="mt-1 text-sm">
              <span className="font-bold">{bill.merchant}</span>,{" "}
              <span className="tabular-nums">{formatRupiah(bill.expectedAmount)}</span> monthly.
              Track it as a recurring bill?
            </p>
            <div className="mt-3 flex gap-2">
              <Button className="min-h-11 flex-1" onPress={() => onConfirmBill(bill.id)}>
                Track bill
              </Button>
              <Button
                className="min-h-11 flex-1"
                onPress={() => onDismissBill(bill.id)}
                variant="secondary"
              >
                Not a bill
              </Button>
            </div>
          </Card>
        ))}
        <Card className="mt-2 block gap-0 rounded-2xl border border-border px-4 py-1">
          {active.length > 0 ? (
            <ul className="divide-y divide-separator">
              {active.map((bill) => (
                <BillRow bill={bill} key={bill.id} />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No recurring bills yet.</p>
          )}
        </Card>
        <p className="mt-2 text-xs text-muted">
          Monara never cancels a subscription for you. Sample bills · this session only.
        </p>
      </section>
    </div>
  );
}

"use client";

import type { ForecastItem, ForecastSummary } from "@monara/contracts";
import { Button } from "@monara/ui";
import { useAmountDisplay, useAppSession } from "@/components/app-session-context";
import { BrandMark } from "@/components/brand-mark";
import styles from "@/components/forecast-ledger.module.css";
import { Icon } from "@/components/icon";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { type ForecastState, useForecast } from "@/components/use-forecast";
import { categoryIcon } from "@/data/category-style";
import { demoForecastFor } from "@/data/demo-forecast";
import { groupForecastByDay, upcomingForecastItems } from "@/lib/forecast/upcoming";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const percent = (confidence: number) => `${Math.round(confidence * 100)}%`;

/** The merchant's logo when it is a known brand, otherwise an icon that matches its name. */
function MerchantMark({ name }: { name: string }) {
  const brand = useMerchantLogo(name);
  if (brand) return <BrandMark brand={brand} size={36} />;
  const icon = categoryIcon(name);
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground"
    >
      <Icon className="h-4 w-4" name={icon === "dot" ? "bills" : icon} />
    </span>
  );
}

function Row({ item }: { item: ForecastItem }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className={styles.row}>
      <MerchantMark name={item.merchantName} />
      <span className={styles.text}>
        <span className={styles.merchant}>{item.merchantName}</span>
        <span className={styles.reason}>{item.reason}</span>
      </span>
      <span className={styles.amount}>
        <strong data-amount>−{formatRupiah(BigInt(item.amount.amountMinor))}</strong>
        <span>Expected · {percent(item.confidence)} sure</span>
      </span>
    </div>
  );
}

function Days({ items }: { items: ForecastItem[] }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="mt-2 space-y-3">
      {groupForecastByDay(items).map((day) => (
        <section aria-labelledby={`forecast-day-${day.date}`} key={day.date}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-1 lg:px-5">
            <h2 className="min-w-0 text-sm font-semibold" id={`forecast-day-${day.date}`}>
              <time dateTime={day.date}>
                {dayFormatter.format(new Date(`${day.date}T00:00:00Z`))}
              </time>
            </h2>
            <p className="text-xs font-medium text-muted tabular-nums [overflow-wrap:anywhere]">
              −{formatRupiah(day.total)} expected
            </p>
          </div>
          <div className={styles.group}>
            {day.items.map((item) => (
              <Row item={item} key={item.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Summary({ forecast, shown }: { forecast: ForecastSummary; shown: ForecastItem[] }) {
  const { formatRupiah } = useAmountDisplay();
  const total = shown.reduce((sum, item) => sum + BigInt(item.amount.amountMinor), BigInt(0));
  const left = forecast.discardedCount;
  return (
    <p className="mt-3 text-xs text-muted" role="status">
      {shown.length} expected {shown.length === 1 ? "payment" : "payments"} this month, about{" "}
      <span data-amount>{formatRupiah(total)}</span>. These have not happened yet.
      {left > 0 ? ` ${left} unsure ${left === 1 ? "payment" : "payments"} left out.` : ""}
    </p>
  );
}

function Notice({ state, hasForecast }: { state: ForecastState; hasForecast: boolean }) {
  if (state.status === "loading") {
    return (
      <p aria-live="polite" className={styles.note}>
        Loading your forecast…
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <p className={styles.error} role="alert">
        {state.message}
      </p>
    );
  }
  return hasForecast ? null : (
    <p className={styles.note}>
      See which bills and habits are likely to hit before the month ends.
    </p>
  );
}

function List({
  forecast,
  today,
  query,
}: {
  forecast: ForecastSummary;
  today: string;
  query: string;
}) {
  const shown = upcomingForecastItems(forecast.items, today, query);
  if (shown.length === 0) {
    return (
      <p className={styles.note}>
        {query.trim()
          ? "No expected payment matches your search."
          : "No repeating payments stood out for the rest of the month. Confirm a few months of expenses and refresh."}
      </p>
    );
  }
  return (
    <>
      <Summary forecast={forecast} shown={shown} />
      <Days items={shown} />
    </>
  );
}

function DemoForecastLedger({ today, query }: { today: string; query: string }) {
  return <List forecast={demoForecastFor(BigInt(0))} query={query} today={today} />;
}

function LiveForecastLedger({ today, query }: { today: string; query: string }) {
  const { state, refreshing, refresh } = useForecast();
  const forecast = state.status === "loading" ? null : state.forecast;
  return (
    <>
      <Notice hasForecast={forecast !== null} state={state} />
      {forecast ? <List forecast={forecast} query={query} today={today} /> : null}
      {state.status === "loading" ? null : (
        <div className="mt-3 flex">
          <Button
            isDisabled={refreshing}
            onPress={refresh}
            type="button"
            variant={forecast ? "secondary" : "primary"}
          >
            <Icon aria-hidden name="sparkle" />
            {refreshing ? "Working it out…" : forecast ? "Refresh forecast" : "Make a forecast"}
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * The Forecast filter of History: payments expected for the rest of this month, drawn faint because
 * none of them has happened. The public demo shows a sample.
 */
export function ForecastLedger({ today, query }: { today: string; query: string }) {
  return useAppSession().dataMode === "live" ? (
    <LiveForecastLedger query={query} today={today} />
  ) : (
    <DemoForecastLedger query={query} today={today} />
  );
}

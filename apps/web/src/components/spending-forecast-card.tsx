"use client";

import type { ForecastItem, ForecastSummary } from "@monara/contracts";
import { Button } from "@monara/ui";
import { useId, useState } from "react";
import { useAmountDisplay, useAppSession } from "@/components/app-session-context";
import { ForecastProjectionChart } from "@/components/forecast-projection-chart";
import { Icon } from "@/components/icon";
import { SectionTitle } from "@/components/section-title";
import { type ForecastState, useForecast } from "@/components/use-forecast";
import { demoForecastFor } from "@/data/demo-forecast";
import { formatDay, type Transaction } from "@/data/demo-ledger";
import { financialMonth } from "@/data/finance-analytics";
import { upcomingForecastItems } from "@/lib/forecast/upcoming";
import styles from "./spending-forecast-card.module.css";

/** How many predictions show before the User asks for the rest. */
const PREVIEW_ITEMS = 4;

const percent = (confidence: number) => `${Math.round(confidence * 100)}%`;
const rupiah = (money: { amountMinor: string }) => BigInt(money.amountMinor);

function Totals({ totals }: { totals: ForecastSummary["totals"] }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <>
      <dl className={styles.totals}>
        <div>
          <dt>This week</dt>
          <dd data-amount>{formatRupiah(rupiah(totals.weekRemaining))}</dd>
        </div>
        <div>
          <dt>This month</dt>
          <dd data-amount>{formatRupiah(rupiah(totals.monthRemaining))}</dd>
        </div>
        <div>
          <dt>Month end</dt>
          <dd data-amount>{formatRupiah(rupiah(totals.projectedMonthEnd))}</dd>
        </div>
      </dl>
      <p className={styles.note}>
        Month end is what you have confirmed so far plus what is still expected.
      </p>
    </>
  );
}

function Row({ item }: { item: ForecastItem }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <li>
      <span className={styles.date}>{formatDay(item.predictedOn)}</span>
      <span className={styles.merchant}>
        <strong>{item.merchantName}</strong>
        <span>{item.reason}</span>
      </span>
      <span className={styles.amount}>
        <span data-amount>{formatRupiah(rupiah(item.amount))}</span>
        <span className={styles.chip} data-tone={item.confidence >= 0.85 ? "high" : "medium"}>
          {percent(item.confidence)} sure
        </span>
      </span>
    </li>
  );
}

/** What is still ahead. Ones that came true or whose day passed are not listed, like the chart. */
function Items({ all, today }: { all: ForecastItem[]; today: string }) {
  const [showAll, setShowAll] = useState(false);
  const items = upcomingForecastItems(all, today);
  if (items.length === 0) {
    return (
      <p className={styles.note}>
        {all.length === 0
          ? "No repeating payments stood out yet. Confirm a few months of expenses and refresh."
          : "Nothing else is expected this month."}
      </p>
    );
  }
  return (
    <>
      <ol aria-label="Expected payments" className={styles.list}>
        {(showAll ? items : items.slice(0, PREVIEW_ITEMS)).map((item) => (
          <Row item={item} key={item.id} />
        ))}
      </ol>
      {items.length > PREVIEW_ITEMS ? (
        <Button
          aria-expanded={showAll}
          className={styles.more}
          onPress={() => setShowAll((value) => !value)}
          type="button"
          variant="ghost"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
          <Icon aria-hidden className="h-4 w-4" name={showAll ? "chevron-up" : "chevron-down"} />
        </Button>
      ) : null}
    </>
  );
}

/** What to say while there is nothing to show yet, or when something went wrong. */
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

function RefreshButton({
  hasForecast,
  refreshing,
  refresh,
}: {
  hasForecast: boolean;
  refreshing: boolean;
  refresh: () => void;
}) {
  return (
    <div className={styles.footer}>
      <Button
        isDisabled={refreshing}
        onPress={refresh}
        type="button"
        variant={hasForecast ? "secondary" : "primary"}
      >
        <Icon aria-hidden name="sparkle" />
        {refreshing ? "Working it out…" : hasForecast ? "Refresh forecast" : "Make a forecast"}
      </Button>
    </div>
  );
}

interface Context {
  transactions: Transaction[];
  month: string;
  today: string;
}

function Body({ forecast, context }: { forecast: ForecastSummary; context: Context }) {
  const days = financialMonth(context.transactions, context.month, context.today).days;
  return (
    <>
      <ForecastProjectionChart days={days} items={forecast.items} today={context.today} />
      <Totals totals={forecast.totals} />
      <Items all={forecast.items} today={context.today} />
    </>
  );
}

/** The public demo shows a sample forecast, because it has no signed-in User to forecast for. */
function DemoCard({ context }: { context: Context }) {
  const titleId = useId();
  const spent = financialMonth(context.transactions, context.month, context.today).spending;
  return (
    <section
      aria-labelledby={titleId}
      className={styles.card}
      data-home-card="forecast"
      data-tour="forecast"
    >
      <div className={styles.header}>
        <SectionTitle icon="pulse" id={titleId}>
          Spending forecast
        </SectionTitle>
        <span>Sample data</span>
      </div>
      <Body context={context} forecast={demoForecastFor(spent)} />
    </section>
  );
}

function LiveCard({ context }: { context: Context }) {
  const titleId = useId();
  const { state, refreshing, refresh } = useForecast(context.today);
  const forecast = state.status === "loading" ? null : state.forecast;
  return (
    <section
      aria-labelledby={titleId}
      className={styles.card}
      data-home-card="forecast"
      data-tour="forecast"
    >
      <div className={styles.header}>
        <SectionTitle icon="pulse" id={titleId}>
          Spending forecast
        </SectionTitle>
        <span>Expected, not confirmed</span>
      </div>
      <Notice hasForecast={forecast !== null} state={state} />
      {forecast ? <Body context={context} forecast={forecast} /> : null}
      {state.status === "loading" ? null : (
        <RefreshButton hasForecast={forecast !== null} refresh={refresh} refreshing={refreshing} />
      )}
    </section>
  );
}

/**
 * What the User is expected to spend for the rest of the month (PRD F17). Everything here is a
 * prediction, so it is labelled as expected and kept apart from confirmed spending.
 */
export function SpendingForecastCard(context: Context) {
  return useAppSession().dataMode === "live" ? (
    <LiveCard context={context} />
  ) : (
    <DemoCard context={context} />
  );
}

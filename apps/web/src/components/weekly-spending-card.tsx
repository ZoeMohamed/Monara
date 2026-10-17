"use client";

import { Button } from "@monara/ui";
import { useId } from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import { formatDay } from "@/data/demo-ledger";
import { chartRatio } from "@/data/finance-analytics";
import type { overviewModel } from "@/data/overview-model";
import styles from "./weekly-spending-card.module.css";

type WeeklySpending = NonNullable<ReturnType<typeof overviewModel>["weekly"]>;

function WeekGauge({ week }: { week: WeeklySpending }) {
  const { formatRupiah } = useAmountDisplay();
  const progress = Math.min(week.percent ?? 0, 100);
  const angle = Math.PI * (1 - week.elapsedPercent / 100);
  const point = (radius: number) => ({
    x: (90 + Math.cos(angle) * radius).toFixed(2),
    y: (84 - Math.sin(angle) * radius).toFixed(2),
  });
  const inner = point(59);
  const outer = point(79);
  const basis = week.basis === "weekly-budgets" ? "weekly limits" : "weekly guide";
  return (
    <figure className={styles.gauge}>
      <svg
        aria-label={
          week.basis
            ? `${week.percent}% of ${basis} used, ${formatRupiah(week.spending)} of ${formatRupiah(week.limit)}. Marker shows ${week.elapsedPercent}% of the week elapsed.`
            : week.hasDifferentWeeklyPeriods
              ? "Weekly budgets have different reset days; view each budget separately"
              : "Weekly spending guide unavailable until a budget is set"
        }
        role="img"
        viewBox="0 0 180 94"
      >
        <path
          d="M20 84a70 70 0 0 1 140 0"
          fill="none"
          stroke="var(--surface-tertiary)"
          strokeLinecap="round"
          strokeWidth="11"
        />
        {progress > 0 ? (
          <path
            className={styles.gaugeFill}
            d="M20 84a70 70 0 0 1 140 0"
            fill="none"
            pathLength={100}
            strokeDasharray={`${progress} 100`}
            strokeLinecap="round"
            strokeWidth="11"
          />
        ) : null}
        {week.basis ? (
          <line
            stroke="var(--foreground)"
            strokeLinecap="round"
            strokeWidth="2.5"
            x1={inner.x}
            x2={outer.x}
            y1={inner.y}
            y2={outer.y}
          />
        ) : null}
        <text
          className={styles.gaugeValue}
          fill="var(--foreground)"
          textAnchor="middle"
          x="90"
          y="81"
        >
          {week.percent === null ? "···" : week.percent > 999 ? "999%+" : `${week.percent}%`}
        </text>
      </svg>
      <figcaption>{week.basis ? `of ${basis}` : "No guide yet"}</figcaption>
    </figure>
  );
}

function GuideNote({ week }: { week: WeeklySpending }) {
  if (week.basis === "weekly-budgets")
    return (
      <p className={styles.note}>
        {week.budgetCount} weekly {week.budgetCount === 1 ? "category budget" : "category budgets"},
        same reset day. Only their confirmed expenses count.
      </p>
    );
  if (week.basis === "monthly-guide")
    return <p className={styles.note}>Monthly limits spread across these seven days.</p>;
  return (
    <p className={styles.note}>
      {week.hasDifferentWeeklyPeriods
        ? "Your weekly budgets reset on different days. View each budget for its progress."
        : "Set monthly budgets to get a weekly spending guide."}
    </p>
  );
}

export function WeeklySpendingCard({
  week,
  openBudgets,
}: {
  week: WeeklySpending;
  openBudgets: () => void;
}) {
  const titleId = useId();
  const { formatRupiah } = useAmountDisplay();
  const tone =
    week.over > BigInt(0)
      ? "over"
      : week.percent !== null && week.percent > week.elapsedPercent
        ? "ahead"
        : "on-track";
  return (
    <section aria-labelledby={titleId} className={styles.card} data-tone={tone}>
      <div className={styles.header}>
        <h2 id={titleId}>{week.basis === "weekly-budgets" ? "This budget week" : "This week"}</h2>
        <span>
          {formatDay(week.startsOn)} – {formatDay(week.endsOn)}
        </span>
      </div>
      <div className={styles.summary}>
        <div className={styles.amount}>
          <strong data-amount>{formatRupiah(week.spending)}</strong>
          <span>
            {week.basis === "weekly-budgets" ? "in budgeted categories" : "confirmed spending"}
          </span>
          {week.basis ? (
            <p className={styles.remaining} data-over={week.over > BigInt(0)}>
              <span data-amount>
                {formatRupiah(week.over > BigInt(0) ? week.over : week.remaining)}
              </span>{" "}
              {week.over > BigInt(0) ? "above" : "left of"}{" "}
              <span data-amount>{formatRupiah(week.limit)}</span>
            </p>
          ) : null}
        </div>
        <WeekGauge week={week} />
      </div>
      <ol aria-label="Daily confirmed expenses this week" className={styles.days}>
        {week.days.map((day) => {
          const dayName = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", {
            weekday: "short",
            timeZone: "UTC",
          });
          return (
            <li data-future={day.future} data-today={day.today} key={day.date}>
              <span className="sr-only">
                {dayName}, {formatDay(day.date)}:{" "}
                {day.future ? "upcoming" : formatRupiah(day.spending)}
              </span>
              <span aria-hidden className={styles.barTrack}>
                {day.spending > BigInt(0) ? (
                  <span
                    className={styles.bar}
                    style={{
                      height: `${Math.max(chartRatio(day.spending, week.maximumDay) * 100, 8)}%`,
                    }}
                  />
                ) : (
                  <span className={styles.zero} />
                )}
              </span>
              <span aria-hidden className={styles.dayLabel}>
                {dayName.slice(0, 1)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.footer}>
        <GuideNote week={week} />
        <Button className={styles.action} onPress={openBudgets} type="button" variant="ghost">
          {week.basis || week.hasDifferentWeeklyPeriods ? "Budgets" : "Set budgets"}
          <Icon aria-hidden name="chevron-right" />
        </Button>
      </div>
    </section>
  );
}

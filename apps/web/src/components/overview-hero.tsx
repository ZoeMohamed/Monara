"use client";

import { Button } from "@monara/ui";
import Image from "next/image";
import { useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";
import { demoMonth, demoToday, formatMonth, formatRupiah } from "@/data/demo-ledger";
import { compactAmount } from "@/data/finance-analytics";
import { type overviewModel, type SceneTime, sceneTime } from "@/data/overview-model";

import styles from "./overview-hero.module.css";

type OverviewModel = ReturnType<typeof overviewModel>;

function subscribeToClock(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  window.addEventListener("focus", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", callback);
  };
}

const greetings: Record<SceneTime, string> = {
  morning: "Good morning.",
  afternoon: "Good afternoon.",
  evening: "Good evening.",
  night: "Good evening.",
};

function ComparisonAction({
  comparison,
  onOpen,
}: {
  comparison: OverviewModel["comparison"];
  onOpen: () => void;
}) {
  if (comparison.state !== "available") return null;
  const difference = comparison.current - comparison.previous;
  const previousName = formatMonth(comparison.previousMonth).split(" ")[0];
  const label =
    difference === BigInt(0)
      ? `Same spending as ${previousName}`
      : `${compactAmount(difference < BigInt(0) ? -difference : difference)} ${difference > BigInt(0) ? "more" : "less"} than ${previousName}`;
  return (
    <Button className={styles.comparison} onPress={onOpen} variant="ghost">
      {label}
      {comparison.throughDay ? ` by day ${comparison.throughDay}` : ""}
      <Icon aria-hidden className="h-4 w-4 shrink-0" name="chevron-right" />
    </Button>
  );
}

export function OverviewHero({
  month,
  model,
  openReports,
  openReview,
  openChat,
}: {
  month: string;
  model: OverviewModel;
  openReports: () => void;
  openReview: () => void;
  openChat: () => void;
}) {
  const time = useSyncExternalStore(
    subscribeToClock,
    () => sceneTime(new Date().getHours()),
    () => "morning" as SceneTime,
  );
  const isCurrentMonth = month === demoMonth;
  const sampleDate = new Date(`${demoToday}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section aria-labelledby="overview-spending" className={styles.hero} data-time={time}>
      <Image
        alt=""
        className={styles.landscape}
        fill
        loading="eager"
        sizes="(min-width: 1440px) 1120px, (min-width: 1024px) calc(100vw - 312px), calc(100vw - 32px)"
        src="/scenes/overview-landscape.webp"
      />
      <div aria-hidden className={styles.shade} />
      <div className={styles.content}>
        <div className={styles.heading}>
          <h2 className={styles.label} id="overview-spending">
            Confirmed spending
          </h2>
          <p className={styles.date}>
            {isCurrentMonth ? `Sample · as of ${sampleDate}` : `Sample · ${formatMonth(month)}`}
          </p>
        </div>
        <p className={styles.greeting}>{greetings[time]}</p>
        <p className={styles.amount}>{formatRupiah(model.summary.spending)}</p>
        <p className={styles.caption}>
          {model.expenseCount} confirmed {model.expenseCount === 1 ? "expense" : "expenses"}
          {isCurrentMonth ? ` · ${formatRupiah(model.todaySpending)} today` : " this month"}
        </p>
        <div className={styles.askRow}>
          <MonaraMascot className={styles.mascot} />
          <button
            aria-label="Open Monara chat. The Agent is not connected yet."
            className={styles.ask}
            onClick={openChat}
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4 shrink-0 text-accent" name="chat" />
            <span className={styles.askLabel}>Ask Monara</span>
            <span className={styles.askStatus}>Not connected</span>
            <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
          </button>
        </div>
        <div className={styles.actions}>
          <ComparisonAction comparison={model.comparison} onOpen={openReports} />
          {model.pendingCount > 0 && isCurrentMonth ? (
            <Button className={styles.review} onPress={openReview} size="sm" variant="secondary">
              Review {model.pendingCount} {model.pendingCount === 1 ? "import" : "imports"}
              <Icon aria-hidden className="h-4 w-4" name="chevron-right" />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

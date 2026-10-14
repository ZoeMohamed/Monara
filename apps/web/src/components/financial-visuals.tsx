"use client";

import { Button, Card } from "@monara/ui";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useState,
} from "react";

import donutStyles from "@/components/category-donut.module.css";
import chartStyles from "@/components/chart-navigation.module.css";
import { Icon } from "@/components/icon";
import { TransactionRow } from "@/components/transaction-row";
import { SectionTitle } from "@/components/visual";
import { categoryDonutGeometry, donutOutline } from "@/data/category-donut";
import { categoryColor, categoryEmoji } from "@/data/category-style";
import {
  demoToday,
  formatDay,
  formatMonth,
  formatRupiah,
  shiftMonth,
  type Transaction,
} from "@/data/demo-ledger";
import {
  cashFlowMonths,
  categoryContainsTransaction,
  categoryKey,
  chartRatio,
  compactAmount,
  financialMonth,
  monthComparison,
} from "@/data/finance-analytics";

type FinanceProps = { transactions: Transaction[]; month: string; today?: string };

function ChartHeading({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-[1_0_10rem]">
        <SectionTitle meta={meta} title={title} />
      </div>
      {action}
    </div>
  );
}

function LegendDot({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 ${dashed ? "rounded-none border-t-2 border-dashed" : "rounded-full"}`}
      style={dashed ? { borderColor: color } : { backgroundColor: color }}
    />
  );
}

function ChartTransactions({
  records,
  onOpenTransaction,
  showDate = false,
}: {
  records: Transaction[];
  onOpenTransaction?: (transaction: Transaction) => void;
  showDate?: boolean;
}) {
  return (
    <ul className="mt-2 divide-y divide-border">
      {records.map((record) => (
        <li key={record.id}>
          {onOpenTransaction ? (
            <TransactionRow
              onClick={() => onOpenTransaction(record)}
              showDate={showDate}
              transaction={record}
            />
          ) : (
            <div className="flex min-h-11 items-center justify-between gap-2 py-2 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">
                  {record.merchant ?? "Merchant unassigned"}
                </span>
                <span className="mt-0.5 block break-words text-muted">
                  {showDate && record.date ? `${formatDay(record.date)} · ` : ""}
                  {record.category ?? "Uncategorized"} · {record.method ?? "Account unassigned"}
                </span>
              </span>
              <strong className="max-w-[47%] break-words text-right tabular-nums">
                {record.amount === null ? "Amount missing" : formatRupiah(record.amount)}
              </strong>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Arrow keys, Home and End move a chart cursor; the pointer moves it directly.
function chartKeySelection(key: string, current: number, minimum: number, maximum: number) {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(minimum, current - 1);
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(maximum, current + 1);
    case "Home":
      return minimum;
    case "End":
      return maximum;
    default:
      return null;
  }
}

function pointerChartX(event: PointerEvent<HTMLElement>, width: number) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return ((event.clientX - bounds.left) / bounds.width) * width;
}

const plotLeft = 78;
const plotWidth = 498;
const plotBottom = 174;
const plotHeight = 140;

type FinanceMonth = ReturnType<typeof financialMonth>;
type FinanceDay = FinanceMonth["days"][number];
type TrendMode = "daily" | "cumulative";

function daySpending(day: FinanceDay, cumulative: boolean) {
  return cumulative ? day.cumulativeSpending : day.spending;
}

function spendingPath(
  days: FinanceDay[],
  cumulative: boolean,
  maximum: bigint,
  periodLength: number,
) {
  return days
    .filter((day) => !day.future || day.transactions.length > 0)
    .map((day, index) => {
      const x = plotLeft + ((day.day - 1) / Math.max(periodLength - 1, 1)) * plotWidth;
      const y = plotBottom - chartRatio(daySpending(day, cumulative), maximum) * plotHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function spendingChartModel(
  current: FinanceMonth,
  previous: FinanceMonth,
  mode: TrendMode,
  selectedDay: number,
) {
  const cumulative = mode === "cumulative";
  const periodLength = Math.max(current.days.length, previous.days.length);
  const xPosition = (day: number) =>
    plotLeft + ((day - 1) / Math.max(periodLength - 1, 1)) * plotWidth;
  const currentMaximum = cumulative ? current.spending : current.maxDailySpending;
  const previousMaximum = cumulative ? previous.spending : previous.maxDailySpending;
  const maximum = currentMaximum > previousMaximum ? currentMaximum : previousMaximum;
  const yPosition = (amount: bigint) => plotBottom - chartRatio(amount, maximum) * plotHeight;
  const detail = current.days[selectedDay - 1];
  const previousDetail = previous.days[selectedDay - 1] ?? null;
  const lastVisibleDay = current.days.findLast((day) => !day.future || day.transactions.length > 0);
  const selectedValue = daySpending(detail, cumulative);
  const previousVisible =
    previousDetail && (!previousDetail.future || previousDetail.transactions.length > 0);
  const previousValue = previousVisible ? daySpending(previousDetail, cumulative) : null;
  return {
    title: `${cumulative ? "Running total of" : "Daily"} confirmed expenses in ${formatMonth(current.month)}, compared with ${formatMonth(previous.month)}. Total ${formatRupiah(current.spending)}.`,
    selectionLabel: cumulative ? "Running total of spending by day" : "Daily spending",
    currentLabel: formatMonth(current.month).split(" ")[0],
    previousLabel: formatMonth(previous.month).split(" ")[0],
    hasPrevious: previous.spending > BigInt(0),
    maximum,
    path: spendingPath(current.days, cumulative, maximum, periodLength),
    previousPath: spendingPath(previous.days, cumulative, maximum, periodLength),
    lastX: lastVisibleDay ? xPosition(lastVisibleDay.day) : plotLeft,
    selectedVisible: !detail.future || detail.transactions.length > 0,
    selectedX: xPosition(selectedDay),
    selectedY: yPosition(selectedValue),
    selectedValue,
    previousY: previousValue === null ? null : yPosition(previousValue),
    previousValue,
    previousDate: previousDetail ? formatDay(previousDetail.date) : null,
    selectedDay,
    detailDate: formatDay(detail.date),
    dayCount: current.days.length,
    periodLength,
    ticks: [1, 8, 15, 22, current.days.length].map((day) => ({ day, x: xPosition(day) })),
  };
}

type SpendingChartModel = ReturnType<typeof spendingChartModel>;

function TrendModeControls({
  mode,
  onChange,
}: {
  mode: TrendMode;
  onChange: (mode: TrendMode) => void;
}) {
  return (
    <fieldset
      aria-label="Spending trend view"
      className="flex min-w-0 rounded-full bg-surface-secondary p-1"
    >
      {(["cumulative", "daily"] as const).map((view) => (
        <Button
          aria-pressed={mode === view}
          className="min-h-11 rounded-full px-3 text-xs"
          key={view}
          onPress={() => onChange(view)}
          variant={mode === view ? "primary" : "ghost"}
        >
          {view === "daily" ? "Daily" : "Running total"}
        </Button>
      ))}
    </fieldset>
  );
}

type CursorStyle = CSSProperties & { "--cursor-x": string; "--cursor-y": string };

function cursorStyle(x: number, y: number, width: number, height: number): CursorStyle {
  return {
    "--cursor-x": `${((x / width) * 100).toFixed(2)}%`,
    "--cursor-y": `${((y / height) * 100).toFixed(2)}%`,
  };
}

function SpendingTrendPlot({
  model,
  animationKey,
  onSelect,
  keyboardSelection,
}: {
  model: SpendingChartModel;
  animationKey: string;
  onSelect: (day: number, keyboard: boolean) => void;
  keyboardSelection: boolean;
}) {
  const titleId = useId();
  const gradientId = useId();
  function selectAt(event: PointerEvent<HTMLDivElement>) {
    const chartX = pointerChartX(event, 600);
    const day = Math.round(((chartX - plotLeft) / plotWidth) * (model.periodLength - 1)) + 1;
    onSelect(Math.min(model.dayCount, Math.max(1, day)), false);
  }
  function moveWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const nextDay = chartKeySelection(event.key, model.selectedDay, 1, model.dayCount);
    if (nextDay === null) return;
    event.preventDefault();
    onSelect(nextDay, true);
  }
  const flip = model.selectedX > 400;
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <LegendDot color="var(--accent)" />
          {model.currentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendDot color="var(--muted)" dashed />
          {model.previousLabel}
          {model.hasPrevious ? "" : ": no recorded spending"}
        </span>
      </div>
      <div
        aria-label={model.selectionLabel}
        aria-valuemax={model.dayCount}
        aria-valuemin={1}
        aria-valuenow={model.selectedDay}
        aria-valuetext={`${model.detailDate}: ${model.selectedVisible ? formatRupiah(model.selectedValue) : "Upcoming, no transactions recorded"}${model.previousDate && model.previousValue !== null ? `. ${model.previousDate}: ${formatRupiah(model.previousValue)}` : ""}`}
        className={`${chartStyles.cursorArea} relative mt-2`}
        data-keyboard={keyboardSelection}
        onKeyDown={moveWithKeys}
        onPointerDown={selectAt}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") selectAt(event);
        }}
        role="slider"
        tabIndex={0}
      >
        <svg
          aria-labelledby={titleId}
          className="block h-auto w-full overflow-visible"
          role="img"
          viewBox="0 0 600 208"
        >
          <title id={titleId}>{model.title}</title>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map((step) => {
            const y = plotBottom - step * 70;
            return (
              <g key={step}>
                <line stroke="var(--border)" strokeDasharray="3 5" x1="78" x2="576" y1={y} y2={y} />
                <text
                  fill="var(--muted)"
                  className="text-[24px] sm:text-[15px]"
                  textAnchor="end"
                  x="68"
                  y={y + 4}
                >
                  {compactAmount((model.maximum * BigInt(step)) / BigInt(2), false).slice(2)}
                </text>
              </g>
            );
          })}
          <g className={chartStyles.reveal} key={animationKey}>
            <path
              d={model.previousPath}
              fill="none"
              stroke="var(--muted)"
              strokeDasharray="5 5"
              strokeOpacity="0.7"
              strokeWidth="2"
            />
            {model.path ? (
              <>
                <path
                  d={`${model.path} L${model.lastX},${plotBottom} L${plotLeft},${plotBottom} Z`}
                  fill={`url(#${gradientId})`}
                />
                <path
                  d={model.path}
                  fill="none"
                  stroke="var(--accent)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
              </>
            ) : null}
          </g>
          <g aria-hidden className={chartStyles.cursor}>
            <line
              stroke="var(--foreground)"
              strokeDasharray="2 4"
              strokeOpacity="0.45"
              style={{ transform: `translateX(${model.selectedX}px)` }}
              x1="0"
              x2="0"
              y1="20"
              y2={plotBottom}
            />
            {model.previousY !== null ? (
              <circle
                fill="var(--surface)"
                r="4.5"
                stroke="var(--muted)"
                strokeWidth="2"
                style={{ transform: `translate(${model.selectedX}px, ${model.previousY}px)` }}
              />
            ) : null}
            {model.selectedVisible ? (
              <circle
                fill="var(--accent)"
                r="5.5"
                stroke="var(--surface)"
                strokeWidth="2.5"
                style={{ transform: `translate(${model.selectedX}px, ${model.selectedY}px)` }}
              />
            ) : null}
          </g>
          {model.ticks.map((tick) => (
            <text
              fill="var(--muted)"
              className="text-[24px] sm:text-[15px]"
              key={tick.day}
              textAnchor="middle"
              x={tick.x}
              y="199"
            >
              {tick.day}
            </text>
          ))}
        </svg>
        <div
          aria-hidden
          className={chartStyles.tooltip}
          data-flip={flip}
          style={cursorStyle(
            model.selectedX,
            Math.min(model.selectedY, model.previousY ?? 999),
            600,
            208,
          )}
        >
          <span className={chartStyles.tooltipPrimary}>
            <span className={chartStyles.tooltipDot} />
            {model.detailDate}
            <strong>
              {model.selectedVisible ? compactAmount(model.selectedValue) : "Upcoming"}
            </strong>
          </span>
          {model.previousDate && model.previousValue !== null && model.hasPrevious ? (
            <span className={chartStyles.tooltipSecondary}>
              <span className={chartStyles.tooltipDot} />
              {model.previousDate}
              <strong>{compactAmount(model.previousValue)}</strong>
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ComparisonPill({ transactions, month, today = demoToday }: FinanceProps) {
  const comparison = monthComparison(transactions, month, today);
  const previousName = formatMonth(comparison.previousMonth).split(" ")[0];
  const difference = comparison.current - comparison.previous;
  if (comparison.state === "future") {
    return <p className={chartStyles.pill}>Comparison available once this month begins.</p>;
  }
  if (comparison.state === "no-baseline") {
    return (
      <p className={chartStyles.pill}>
        No spending recorded in {previousName}
        {comparison.throughDay ? ` by day ${comparison.throughDay}` : ""} to compare with.
      </p>
    );
  }
  return (
    <p className={chartStyles.pill}>
      {difference !== BigInt(0) ? (
        <span
          aria-hidden
          className={chartStyles.pillArrow}
          data-direction={difference > BigInt(0) ? "up" : "down"}
        >
          ↑
        </span>
      ) : null}
      {difference === BigInt(0)
        ? `Same as ${previousName}`
        : `${compactAmount(difference < BigInt(0) ? -difference : difference)} ${difference > BigInt(0) ? "more" : "less"} than ${previousName}`}
      {comparison.throughDay ? ` by day ${comparison.throughDay}` : ""}
    </p>
  );
}

function defaultTrendDay(month: FinanceMonth, today: string) {
  const defaultDay = month.month === today.slice(0, 7) ? Number(today.slice(8)) : 1;
  return Math.min(
    month.days.length,
    month.month < today.slice(0, 7) ? month.days.length : defaultDay,
  );
}

export function SpendingTrend({ transactions, month, today = demoToday }: FinanceProps) {
  const [mode, setMode] = useState<TrendMode>("cumulative");
  const [selection, setSelection] = useState<{
    month: string;
    day: number;
    keyboard: boolean;
  } | null>(null);
  const current = financialMonth(transactions, month, today);
  const previous = financialMonth(transactions, shiftMonth(month, -1), today);
  const selectedDay = selection?.month === month ? selection.day : defaultTrendDay(current, today);
  const model = spendingChartModel(current, previous, mode, selectedDay);
  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-4">
      <ChartHeading
        action={<TrendModeControls mode={mode} onChange={setMode} />}
        title="Spending trend"
      />
      <SpendingTrendPlot
        animationKey={`${month}-${mode}`}
        keyboardSelection={selection?.month === month && selection.keyboard}
        model={model}
        onSelect={(day, keyboard) => setSelection({ month, day, keyboard })}
      />
      <ComparisonPill month={month} today={today} transactions={transactions} />
    </Card>
  );
}

type CashFlowPeriod = ReturnType<typeof cashFlowMonths>[number];

function cashFlowLabel(period: CashFlowPeriod, today: string) {
  const periodName = formatMonth(period.month);
  if (period.confirmedCount === 0) {
    return `${periodName}. ${period.month > today.slice(0, 7) ? "Upcoming, no transactions recorded" : "No confirmed transactions recorded"}.`;
  }
  return `${periodName}. Income ${formatRupiah(period.income)}; expenses ${formatRupiah(period.spending)}; net income ${formatRupiah(period.difference)}.`;
}

function CashFlowDetails({ period, today }: { period: CashFlowPeriod; today: string }) {
  return (
    <span className={chartStyles.tooltipCard}>
      <strong>{formatMonth(period.month)}</strong>
      {period.confirmedCount === 0 ? (
        <span className="opacity-75">
          {period.month > today.slice(0, 7) ? "Upcoming · nothing recorded" : "Nothing recorded"}
        </span>
      ) : (
        <>
          <span className={chartStyles.tooltipIncome}>In {compactAmount(period.income)}</span>
          <span>Out {compactAmount(period.spending)}</span>
          <span className="opacity-75">Net {compactAmount(period.difference)}</span>
        </>
      )}
    </span>
  );
}

export function CashFlowChart({ transactions, month, today = demoToday }: FinanceProps) {
  const titleId = useId();
  const [selection, setSelection] = useState<{ month: string; keyboard: boolean } | null>(null);
  const periods = cashFlowMonths(transactions, month);
  const detail = periods.find((period) => period.month === selection?.month) ?? periods[5];
  const selectedIndex = periods.findIndex((period) => period.month === detail.month);
  const maximum = periods.reduce((largest, period) => {
    const tallest = period.income > period.spending ? period.income : period.spending;
    return tallest > largest ? tallest : largest;
  }, BigInt(0));
  const columnX = (index: number) => 91 + index * 84;
  const detailTop = Math.max(
    chartRatio(detail.income, maximum),
    chartRatio(detail.spending, maximum),
  );

  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-4">
      <ChartHeading meta="6 months" title="Cash flow" />
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <LegendDot color="var(--success)" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <LegendDot color="var(--accent)" />
          Expenses
        </span>
      </div>
      <div
        aria-label="Cash flow by month"
        aria-valuemax={periods.length}
        aria-valuemin={1}
        aria-valuenow={selectedIndex + 1}
        aria-valuetext={cashFlowLabel(detail, today)}
        className={`${chartStyles.cursorArea} relative mt-2`}
        data-keyboard={selection?.keyboard ?? false}
        onKeyDown={(event) => {
          const nextIndex = chartKeySelection(event.key, selectedIndex, 0, periods.length - 1);
          if (nextIndex === null) return;
          event.preventDefault();
          setSelection({ month: periods[nextIndex].month, keyboard: true });
        }}
        onPointerDown={(event) => {
          const index = Math.round((pointerChartX(event, 600) - 101) / 84);
          setSelection({
            month: periods[Math.min(periods.length - 1, Math.max(0, index))].month,
            keyboard: false,
          });
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const index = Math.round((pointerChartX(event, 600) - 101) / 84);
          setSelection({
            month: periods[Math.min(periods.length - 1, Math.max(0, index))].month,
            keyboard: false,
          });
        }}
        role="slider"
        tabIndex={0}
      >
        <svg
          aria-labelledby={titleId}
          className="block h-auto w-full"
          role="img"
          viewBox="0 0 600 216"
        >
          <title id={titleId}>
            {`Confirmed monthly income and expenses, ${formatMonth(periods[0].month)} through ${formatMonth(month)}.`}
          </title>
          {[0, 1, 2].map((step) => (
            <g key={step}>
              <line
                stroke="var(--border)"
                strokeDasharray="3 5"
                x1="78"
                x2="578"
                y1={plotBottom - step * 70}
                y2={plotBottom - step * 70}
              />
              <text
                fill="var(--muted)"
                className="text-[24px] sm:text-[15px]"
                textAnchor="end"
                x="68"
                y={178 - step * 70}
              >
                {compactAmount((maximum * BigInt(step)) / BigInt(2), false).slice(2)}
              </text>
            </g>
          ))}
          <rect
            aria-hidden
            className={chartStyles.column}
            fill="var(--surface-secondary)"
            height="176"
            rx="12"
            style={{ transform: `translateX(${columnX(selectedIndex) - 20}px)` }}
            width="64"
            y="16"
          />
          {periods.map((period, index) => {
            const x = columnX(index);
            const incomeHeight = chartRatio(period.income, maximum) * plotHeight;
            const expenseHeight = chartRatio(period.spending, maximum) * plotHeight;
            const delay = { animationDelay: `${index * 60}ms` };
            return (
              <g key={`${month}-${period.month}`}>
                <rect
                  className={chartStyles.bar}
                  fill="var(--success)"
                  height={incomeHeight}
                  rx="4"
                  style={delay}
                  width="18"
                  x={x - 10}
                  y={plotBottom - incomeHeight}
                />
                <rect
                  className={chartStyles.bar}
                  fill="var(--accent)"
                  height={expenseHeight}
                  rx="4"
                  style={delay}
                  width="18"
                  x={x + 13}
                  y={plotBottom - expenseHeight}
                />
                <text
                  fill={period.month === detail.month ? "var(--foreground)" : "var(--muted)"}
                  className="text-[24px] font-semibold sm:text-[15px]"
                  textAnchor="middle"
                  x={x + 10}
                  y="209"
                >
                  {formatMonth(period.month).slice(0, 3)}
                </text>
              </g>
            );
          })}
        </svg>
        <div
          aria-hidden
          className={`${chartStyles.tooltip} ${chartStyles.tooltipAbove}`}
          data-flip={selectedIndex >= 4}
          style={cursorStyle(
            columnX(selectedIndex) + 10,
            plotBottom - detailTop * plotHeight,
            600,
            216,
          )}
        >
          <CashFlowDetails period={detail} today={today} />
        </div>
      </div>
    </Card>
  );
}

type CategorySegment = FinanceMonth["categories"][number] &
  ReturnType<typeof categoryDonutGeometry>[number] & { color: string; start: number };

type SliceStyle = CSSProperties & {
  "--slice-x": string;
  "--slice-y": string;
  "--slice-color": string;
  "--slice-delay": string;
};

function categoryLabel(segment: CategorySegment): string {
  return `${segment.name}, ${formatRupiah(segment.amount)}, ${(segment.proportion * 100).toFixed(1)}% of expenses. Show category details.`;
}

function CategoryDonut({
  segments,
  highlighted,
  total,
  month,
  onSelect,
}: {
  segments: CategorySegment[];
  highlighted?: CategorySegment;
  total: bigint;
  month: string;
  onSelect: (category: string, fromChart: boolean, keyboard: boolean) => void;
}) {
  const titleId = useId();
  return (
    <fieldset className={donutStyles.chart}>
      <legend className="sr-only">Spending categories</legend>
      <svg aria-labelledby={titleId} key={month} viewBox="-14 -14 248 248">
        <title
          id={titleId}
        >{`Spending categories for ${formatMonth(month)}. Select a slice to see payments.`}</title>
        {segments.length > 0 ? (
          <circle aria-hidden className={donutStyles.guide} cx="110" cy="110" fill="none" r="118" />
        ) : (
          <circle
            aria-hidden
            cx="110"
            cy="110"
            fill="none"
            r="84"
            stroke="var(--surface-tertiary)"
            strokeWidth="26"
          />
        )}
        {highlighted ? (
          <path
            aria-hidden
            className={donutStyles.outline}
            d={donutOutline(highlighted.start, highlighted.start + highlighted.proportion)}
            key={categoryKey(highlighted)}
            stroke={highlighted.color}
          />
        ) : null}
        {segments
          .filter((segment) => segment.path)
          .map((segment, index) => {
            const style: SliceStyle = {
              clipPath: `path("${segment.path}")`,
              "--slice-x": `${segment.offsetX.toFixed(3)}px`,
              "--slice-y": `${segment.offsetY.toFixed(3)}px`,
              "--slice-color": segment.color,
              "--slice-delay": `${index * 70}ms`,
            };
            return (
              <foreignObject
                className={donutStyles.sliceHost}
                height="220"
                key={categoryKey(segment)}
                width="220"
                x="0"
                y="0"
              >
                <button
                  aria-label={categoryLabel(segment)}
                  aria-pressed={highlighted === segment}
                  className={donutStyles.slice}
                  data-muted={Boolean(highlighted && highlighted !== segment)}
                  onClick={(event) => onSelect(categoryKey(segment), true, event.detail === 0)}
                  style={style}
                  title={`${segment.name} · ${formatRupiah(segment.amount)} · ${(segment.proportion * 100).toFixed(1)}%`}
                  type="button"
                >
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 220 220">
                    <path d={segment.path} fill={segment.color} />
                    <path className={donutStyles.focusRing} d={segment.path} fill="none" />
                    <path className={donutStyles.focusEdge} d={segment.path} fill="none" />
                  </svg>
                </button>
              </foreignObject>
            );
          })}
      </svg>
      <div
        aria-live="polite"
        className={donutStyles.center}
        key={highlighted ? categoryKey(highlighted) : "all"}
      >
        <p className="max-w-full break-words text-xs text-muted">
          {highlighted ? highlighted.name : "Money out"}
        </p>
        <p className="mt-1 max-w-full break-words text-[1.35rem] font-black tracking-[-0.04em] tabular-nums">
          {compactAmount(highlighted?.amount ?? total)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {highlighted
            ? `${(highlighted.proportion * 100).toFixed(0)}% · ${highlighted.count} ${highlighted.count === 1 ? "expense" : "expenses"}`
            : `${segments.length} ${segments.length === 1 ? "category" : "categories"}`}
        </p>
      </div>
    </fieldset>
  );
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CategoryBreakdown({
  transactions,
  month,
  today = demoToday,
  onSelectCategory,
  selectedCategory,
  onOpenTransaction,
}: FinanceProps & {
  // Owned selection values are category UUIDs; demo values remain category names.
  onSelectCategory?: (category: string) => void;
  selectedCategory?: string | null;
  onOpenTransaction?: (transaction: Transaction) => void;
}) {
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [keyboardSelection, setKeyboardSelection] = useState(false);
  const paymentsId = useId();
  const summary = financialMonth(transactions, month, today);
  const selection = selectedCategory === undefined ? localSelection : selectedCategory;
  const geometry = categoryDonutGeometry(summary.categories.map((category) => category.amount));
  const segments = summary.categories.map((category, index) => ({
    ...category,
    ...geometry[index],
    start: geometry.slice(0, index).reduce((sum, item) => sum + item.proportion, 0),
    color: categoryColor(category.name, index),
  }));
  const highlighted = segments.find((category) => categoryKey(category) === selection);
  const countedDays = month === today.slice(0, 7) ? Number(today.slice(8)) : summary.days.length;
  const categoryRecords = highlighted
    ? summary.days
        .flatMap((day) => day.transactions)
        .filter(
          (record) => record.kind === "expense" && categoryContainsTransaction(highlighted, record),
        )
        .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))
    : [];
  function selectCategory(category: string, fromChart: boolean, keyboard: boolean) {
    const opening = selection !== category;
    setKeyboardSelection(keyboard);
    setLocalSelection(opening ? category : null);
    onSelectCategory?.(category);
    // A slice tap leads to the same payments the list row shows, even when they are off screen.
    if (fromChart && opening) {
      requestAnimationFrame(() =>
        document.getElementById(paymentsId)?.scrollIntoView({
          behavior: keyboard || prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest",
        }),
      );
    }
  }

  return (
    <Card
      className={`${donutStyles.breakdown} block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-4`}
      data-keyboard={keyboardSelection}
    >
      <ChartHeading title="Where the money went" />
      <CategoryDonut
        highlighted={highlighted}
        month={month}
        onSelect={selectCategory}
        segments={segments}
        total={summary.spending}
      />
      {segments.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {segments.map((segment, index) => (
            <li
              className={donutStyles.row}
              key={categoryKey(segment)}
              style={{ animationDelay: `${120 + index * 50}ms` }}
            >
              <button
                aria-label={categoryLabel(segment)}
                aria-pressed={selection === categoryKey(segment)}
                className={donutStyles.rowButton}
                onClick={(event) => selectCategory(categoryKey(segment), false, event.detail === 0)}
                style={{ "--slice-color": segment.color } as CSSProperties}
                type="button"
              >
                <span aria-hidden className={donutStyles.rowIcon}>
                  {categoryEmoji(segment.name)}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block break-words text-sm font-semibold">{segment.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {(segment.proportion * 100).toFixed(0)}% ·{" "}
                    {compactAmount(segment.amount / BigInt(Math.max(countedDays, 1)))}/day
                  </span>
                </span>
                <span className="max-w-[45%] break-words text-right text-sm font-bold tabular-nums">
                  {formatRupiah(segment.amount)}
                </span>
                <Icon
                  className={`${donutStyles.chevron} h-4 w-4 shrink-0 text-muted`}
                  name="chevron-right"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-center text-xs text-muted">No expenses this month.</p>
      )}
      {highlighted ? (
        <section
          aria-live="polite"
          className={`${donutStyles.payments} mt-3 scroll-mt-4 rounded-xl bg-surface-secondary p-3`}
          id={paymentsId}
          key={categoryKey(highlighted)}
        >
          <h3 className="flex items-center gap-2 text-xs font-bold">
            <LegendDot color={highlighted.color} />
            {highlighted.name} payments
          </h3>
          <ChartTransactions
            onOpenTransaction={onOpenTransaction}
            records={categoryRecords}
            showDate
          />
        </section>
      ) : null}
    </Card>
  );
}

export function SpendingCalendar({
  transactions,
  month,
  today = demoToday,
  onOpenTransaction,
}: FinanceProps & {
  onOpenTransaction?: (transaction: Transaction) => void;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const headingId = useId();
  const summary = financialMonth(transactions, month, today);
  const detail =
    summary.days.find((day) => day.date === selection) ??
    summary.days.find((day) => day.date === today) ??
    summary.days.find((day) => day.transactions.length > 0) ??
    summary.days[0];
  const emptyColumns = Array.from({ length: summary.calendarOffset }, (_, index) => index);
  const countedDays = month === today.slice(0, 7) ? Number(today.slice(8)) : summary.days.length;

  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-4">
      <ChartHeading
        meta={`avg ${compactAmount(summary.spending / BigInt(Math.max(countedDays, 1)))}/day`}
        title="Daily spending"
      />
      <fieldset
        aria-label={`${formatMonth(month)} spending calendar`}
        className="mt-4 grid min-w-0 grid-cols-7 gap-1"
        key={month}
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <span className="pb-1 text-center text-[10px] font-semibold text-muted" key={weekday}>
            {weekday}
          </span>
        ))}
        {emptyColumns.map((column) => (
          <span aria-hidden key={`empty-${column}`} />
        ))}
        {summary.days.map((day, index) => {
          const proportion = chartRatio(day.spending, summary.maxDailySpending);
          const level = proportion === 0 ? 0 : Math.max(1, Math.ceil(proportion * 4));
          const heat = [
            "bg-surface-secondary text-muted",
            "bg-accent-soft text-accent-soft-foreground",
            "bg-accent/25 text-foreground",
            "bg-accent/80 text-white",
            "bg-accent text-white",
          ][level];
          const future = day.future && day.transactions.length === 0;
          return (
            <Button
              aria-current={day.date === today ? "date" : undefined}
              aria-label={`${formatDay(day.date)}${day.date === today ? ", today" : ""}: ${future ? "upcoming, no transactions recorded" : `${formatRupiah(day.spending)} spent, ${formatRupiah(day.income)} income`}. Show payments.`}
              aria-pressed={day.date === detail.date}
              className={`${chartStyles.calendarDay} min-h-11 w-full min-w-0 rounded-lg border px-0 text-xs font-semibold ${future ? "border-dashed border-border bg-surface text-muted" : `${heat} border-transparent`} ${day.date === detail.date ? "ring-2 ring-foreground ring-inset" : ""}`}
              key={day.date}
              onPress={() => setSelection(day.date)}
              style={{ animationDelay: `${index * 12}ms` }}
              variant="ghost"
            >
              {day.day}
              {day.income > BigInt(0) ? (
                <span
                  aria-hidden
                  className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-success"
                />
              ) : null}
            </Button>
          );
        })}
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          Less
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-surface-secondary" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent-soft" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent/25" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent/80" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent" />
          More
        </span>
        <span className="flex items-center gap-1">
          <LegendDot color="var(--success)" />
          Income recorded
        </span>
      </div>
      <section
        aria-labelledby={headingId}
        aria-live="polite"
        className="mt-4 rounded-xl bg-surface-secondary p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="text-xs font-bold" id={headingId}>
            {formatDay(detail.date)}
            {detail.date === today ? " · Today" : ""}
          </h3>
          <span className="text-[11px] text-muted">
            {detail.transactions.length} {detail.transactions.length === 1 ? "payment" : "payments"}
          </span>
        </div>
        {detail.future && detail.transactions.length === 0 ? null : (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
            <span>
              Spent <strong>{formatRupiah(detail.spending)}</strong>
            </span>
            {detail.income > BigInt(0) ? (
              <span className="text-success">
                Income <strong>{formatRupiah(detail.income)}</strong>
              </span>
            ) : null}
          </div>
        )}
        {detail.transactions.length > 0 ? (
          <ChartTransactions onOpenTransaction={onOpenTransaction} records={detail.transactions} />
        ) : (
          <p className="mt-2 text-xs text-muted">
            {detail.future ? "Upcoming day. No transactions." : "No transactions this day."}
          </p>
        )}
      </section>
    </Card>
  );
}

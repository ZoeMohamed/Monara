"use client";

import type { FinancialInsights } from "@monara/contracts";
import { Button, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import Image from "next/image";
import {
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { CategoryAvatar } from "@/components/category-symbol";

import { Icon, type IconName } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { SectionLabel, SectionTitle } from "@/components/section-title";
import { SpendingForecastCard } from "@/components/spending-forecast-card";
import { TransactionRow } from "@/components/transaction-row";
import { categoryColor } from "@/data/category-style";
import {
  daysInMonth,
  formatDay,
  formatMonth,
  shiftMonth,
  type Transaction,
} from "@/data/demo-ledger";
import {
  categoryContainsTransaction,
  categoryKey,
  categoryMatchesBudget,
  chartRatio,
  financialMonth,
} from "@/data/finance-analytics";
import {
  type AttentionItem,
  type overviewModel,
  type SceneTime,
  sceneTime,
} from "@/data/overview-model";

import styles from "./mobile-overview.module.css";

type OverviewModel = ReturnType<typeof overviewModel>;

const greetings: Record<SceneTime, string> = {
  morning: "Good morning.",
  afternoon: "Good afternoon.",
  evening: "Good evening.",
  night: "Good evening.",
};

// Each prompt asks the Agent about confirmed records; none of them change data.
const prompts: { text: string; icon: IconName; prompt: string }[] = [
  { text: "Review my week", icon: "pulse", prompt: "Review my spending this week" },
  { text: "Where did it go?", icon: "pie", prompt: "Where did my money go this month?" },
  { text: "Can I afford it?", icon: "sparkle", prompt: "Can I afford a 300k dinner?" },
];

function revealFocusedPrompt(event: FocusEvent<HTMLElement>) {
  const scroller = event.currentTarget;
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  const viewport = scroller.getBoundingClientRect();
  const target = event.target.getBoundingClientRect();
  const padding = getComputedStyle(scroller);
  const start = viewport.left + Number.parseFloat(padding.paddingLeft);
  const end = viewport.right - Number.parseFloat(padding.paddingRight);
  const left = target.left < start ? target.left - start : Math.max(0, target.right - end);
  if (left) scroller.scrollBy({ left, behavior: "instant" });
}

function OverviewComposer({ openChat }: { openChat: (prompt?: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      aria-label="Ask Monara from your overview"
      className={styles.ask}
      onSubmit={(event) => {
        event.preventDefault();
        openChat(draft.trim() || undefined);
      }}
    >
      <span aria-hidden className={styles.askPaw}>
        <Icon name="chat" />
      </span>
      <TextField className={styles.askField} onChange={setDraft} value={draft}>
        <Label className="sr-only">Ask Monara anything</Label>
        <Input
          autoComplete="off"
          className={styles.askInput}
          enterKeyHint="send"
          maxLength={4_000}
          placeholder="Ask Monara anything"
        />
      </TextField>
      <Button
        aria-label={draft.trim() ? "Send to Monara chat" : "Open Monara chat"}
        className={styles.askArrow}
        isIconOnly
        type="submit"
        variant="ghost"
      >
        <Icon name="send" strokeWidth={2.4} />
      </Button>
    </form>
  );
}

function subscribeToClock(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  window.addEventListener("focus", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", callback);
  };
}

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function monthName(month: string) {
  return formatMonth(month).split(" ")[0] ?? month;
}

// How this month compares with the last one, as plain words beside the headline figure.
function ComparisonNote({ comparison }: { comparison: OverviewModel["comparison"] }) {
  const { compactAmount } = useAmountDisplay();
  if (comparison.state !== "available") return null;
  const difference = comparison.current - comparison.previous;
  const previous = monthName(comparison.previousMonth).slice(0, 3);
  if (difference === BigInt(0)) return <> · same as {previous}</>;
  const size = difference < BigInt(0) ? -difference : difference;
  return (
    <>
      {" · "}
      <span data-amount>{compactAmount(size)}</span> {difference > BigInt(0) ? "more" : "less"} than{" "}
      {previous}
    </>
  );
}

function SceneHero({
  month,
  today,
  model,
  amountsHidden,
  toggleAmounts,
  openChat,
}: {
  month: string;
  today: string;
  model: OverviewModel;
  amountsHidden: boolean;
  toggleAmounts: () => void;
  openChat: (prompt?: string) => void;
}) {
  const { formatRupiah, compactAmount } = useAmountDisplay();
  const time = useSyncExternalStore(
    subscribeToClock,
    () => sceneTime(new Date().getHours()),
    () => "afternoon" as SceneTime,
  );
  const spendingDigits = formatRupiah(model.summary.spending).replace(/^Rp\s?/, "");
  let todayLine = "Nothing logged yet today.";
  if (!model.isCurrentMonth) todayLine = "A look back at your month.";
  else if (model.todayCount > 0)
    todayLine = `${amountsHidden ? "Some" : compactAmount(model.todaySpending)} spent today.`;

  return (
    <section aria-labelledby="home-greeting" className={styles.scene} data-time={time}>
      <div aria-hidden className={styles.sky}>
        <Image
          alt=""
          className={styles.landscape}
          fill
          fetchPriority="high"
          loading="eager"
          sizes="(max-width: 1023px) 100vw, 1280px"
          src="/scenes/overview-landscape.webp"
        />
      </div>
      <div aria-hidden className={styles.shade} />

      <div className={styles.sceneContent}>
        <OnboardingBanner />
        <p className={styles.date}>{model.isCurrentMonth ? longDate(today) : formatMonth(month)}</p>
        <h1 className={styles.greeting} id="home-greeting">
          {greetings[time]}
        </h1>
        <p className={styles.today}>{todayLine}</p>

        <div className={styles.amountRow} data-tour="balance">
          <p className={styles.amount}>
            <span className="sr-only">
              {amountsHidden
                ? `${monthName(month)} spending hidden`
                : `${monthName(month)} spending ${formatRupiah(model.summary.spending)}`}
            </span>
            <span aria-hidden className={styles.currency}>
              Rp
            </span>
            <span aria-hidden>{amountsHidden ? "••••••" : spendingDigits}</span>
          </p>
          <Button
            variant="ghost"
            aria-label={amountsHidden ? "Show amounts" : "Hide amounts"}
            aria-pressed={amountsHidden}
            className={styles.eye}
            onPress={toggleAmounts}
            type="button"
          >
            <Icon name={amountsHidden ? "eye-off" : "eye"} />
          </Button>
        </div>
        <p className={styles.caption}>
          {monthName(month)} spending
          {model.isCurrentMonth ? ` · day ${model.currentDay}` : ""}
          <ComparisonNote comparison={model.comparison} />
        </p>

        <div className={styles.askWrap} data-tour="ask">
          <MonaraMascot className={styles.mascot} pose="peek" />
          <OverviewComposer openChat={openChat} />
        </div>
        <nav
          aria-label="Ask Monara"
          className={styles.prompts}
          onFocusCapture={revealFocusedPrompt}
        >
          {prompts.map((item) => (
            <Button
              variant="ghost"
              key={item.text}
              onPress={() => openChat(item.prompt)}
              type="button"
            >
              <Icon name={item.icon} />
              {item.text}
            </Button>
          ))}
        </nav>
      </div>
    </section>
  );
}

function CategoryItem({
  name,
  icon,
  amount,
  index,
  budgetLimit,
  scale,
  open,
  paymentsId,
  payments,
  onToggle,
  openTransaction,
}: {
  name: string;
  icon?: string;
  amount: bigint;
  index: number;
  budgetLimit: bigint | null;
  scale: bigint;
  open: boolean;
  paymentsId: string;
  payments: Transaction[];
  onToggle: () => void;
  openTransaction: (transaction: Transaction) => void;
}) {
  const { formatRupiah, compactAmount } = useAmountDisplay();
  const over = budgetLimit !== null && amount > budgetLimit;
  return (
    <li>
      <Button
        variant="ghost"
        aria-controls={open ? paymentsId : undefined}
        aria-expanded={open}
        aria-label={`${name}, ${formatRupiah(amount)}${budgetLimit !== null ? ` of ${formatRupiah(budgetLimit)} budget${over ? ", over budget" : ""}` : ""}. Show payments.`}
        className={styles.category}
        onPress={onToggle}
        style={{ "--category-color": categoryColor(name, index) } as CSSProperties}
        type="button"
      >
        <CategoryAvatar className={styles.categoryIcon} icon={icon} name={name} size={44} />
        <span className={styles.categoryBody}>
          <span className={styles.categoryLabel}>
            <span className={styles.categoryName}>
              <strong>{name}</strong>
              {budgetLimit !== null ? (
                <span className={styles.budgetCaption}>
                  {over ? "Over · " : "of "}
                  <span data-amount>{compactAmount(budgetLimit)}</span>
                </span>
              ) : null}
            </span>
            <strong data-amount data-over={over}>
              {compactAmount(amount)}
            </strong>
          </span>
          <span aria-hidden className={styles.track}>
            <span
              data-over={over}
              style={{ width: `${Math.min(chartRatio(amount, scale) * 100, 100)}%` }}
            />
          </span>
        </span>
      </Button>
      {open ? (
        <ul aria-label={`${name} payments`} className={styles.payments} id={paymentsId}>
          {payments.map((item) => (
            <li key={item.id}>
              <TransactionRow onClick={() => openTransaction(item)} showDate transaction={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SpendingBlock({
  month,
  setMonth,
  today,
  model,
  transactions,
  openTransaction,
  openReview,
  openAdd,
  openConnectGmail,
}: {
  month: string;
  setMonth: (month: string) => void;
  today: string;
  model: OverviewModel;
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
  openReview: () => void;
  openAdd?: () => void;
  openConnectGmail?: () => void;
}) {
  const [selection, setSelection] = useState<{ month: string; category: string } | null>(null);
  const paymentsId = useId();
  const monthId = useId();
  const currentMonth = today.slice(0, 7);
  const categories = financialMonth(transactions, month, today).categories;
  const selected = selection?.month === month ? selection.category : null;
  const months = Array.from({ length: 13 }, (_, index) => shiftMonth(currentMonth, -index));

  return (
    <section aria-labelledby="spending-title" className={styles.block} data-home-card="where">
      <div className={styles.blockHead}>
        <SectionTitle icon="reports" id="spending-title">
          Where it went
        </SectionTitle>
        <Select
          className={styles.monthPicker}
          onChange={(value) => {
            if (value !== null) setMonth(String(value));
          }}
          value={month}
        >
          <Label className="sr-only" htmlFor={monthId}>
            Month
          </Label>
          <Select.Trigger className={styles.monthTrigger} id={monthId}>
            <Select.Value className={styles.monthValue} />
            <Select.Indicator className={styles.monthIndicator} />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {months.map((value) => {
                const label = value === currentMonth ? "This month" : formatMonth(value);
                return (
                  <ListBox.Item className="min-h-11" id={value} key={value} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {categories.length === 0 ? (
        <div className={styles.empty}>
          <MonaraMascot className={styles.emptyMascot} pose="curious" />
          <p>
            <strong>{model.emptyTitle}</strong>
            Add a payment or bring in receipts from Gmail.
          </p>
          <div>
            {openAdd ? (
              <Button variant="ghost" className={styles.primary} onPress={openAdd} type="button">
                <Icon name="plus" strokeWidth={2.2} />
                Add payment
              </Button>
            ) : null}
            {model.pendingCount > 0 ? (
              <Button
                variant="ghost"
                className={styles.secondary}
                onPress={openReview}
                type="button"
              >
                Review {model.pendingCount}
              </Button>
            ) : openConnectGmail ? (
              <Button
                variant="ghost"
                className={styles.secondary}
                onPress={openConnectGmail}
                type="button"
              >
                Connect Gmail
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className={styles.categoryList}>
          {categories.map((category, index) => {
            const key = categoryKey(category);
            const budget = model.usage.find((item) => categoryMatchesBudget(category, item.budget));
            // Category spending belongs to the selected calendar month. A payday
            // limit describes a different range and must not be compared to it.
            const monthBudget =
              budget?.periodStartsOn === `${month}-01` &&
              budget.periodEndsOn === `${month}-${daysInMonth(month)}`
                ? budget
                : undefined;
            return (
              <CategoryItem
                amount={category.amount}
                budgetLimit={monthBudget?.limit ?? null}
                index={index}
                key={key}
                name={category.name}
                icon={category.icon ?? budget?.budget.icon}
                onToggle={() => setSelection(selected === key ? null : { month, category: key })}
                open={selected === key}
                openTransaction={openTransaction}
                payments={model.summary.confirmed.filter(
                  (item) => item.kind === "expense" && categoryContainsTransaction(category, item),
                )}
                paymentsId={paymentsId}
                scale={monthBudget?.limit ?? categories[0].amount}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TodayLine({ model }: { model: OverviewModel }) {
  const { compactAmount } = useAmountDisplay();
  if (model.todayCount === 0) return <p>Nothing spent yet today.</p>;
  return (
    <p>
      <span data-amount>{compactAmount(model.todaySpending)}</span> spent today ·{" "}
      {model.todayCount === 1 ? "1 payment" : `${model.todayCount} payments`}
    </p>
  );
}

// The newest confirmed records. Rows are keyed by id, so an added record mounts and
// animates in while the rest stay put; edits and deletions update in place.
function ActivityCard({
  month,
  model,
  openTransaction,
  openTransactions,
  openAdd,
}: {
  month: string;
  model: OverviewModel;
  openTransaction: (transaction: Transaction) => void;
  openTransactions?: () => void;
  openAdd?: () => void;
}) {
  return (
    <section
      aria-labelledby="activity-title"
      className={styles.todayCard}
      data-home-card="activity"
    >
      <div className={styles.activityHead}>
        <SectionTitle icon="history" id="activity-title">
          {model.isCurrentMonth ? "Latest activity" : `Latest in ${monthName(month)}`}
        </SectionTitle>
        {openTransactions && model.recent.length > 0 ? (
          <Button
            variant="ghost"
            className={styles.seeAll}
            onPress={openTransactions}
            type="button"
          >
            See all
          </Button>
        ) : null}
      </div>
      {model.isCurrentMonth ? <TodayLine model={model} /> : null}
      {model.recent.length > 0 ? (
        <ul aria-label="Latest transactions">
          {model.recent.map((item, index) => (
            <li
              className={styles.activityItem}
              key={item.id}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <TransactionRow onClick={() => openTransaction(item)} showDate transaction={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p>Paid in cash? Log it in seconds.</p>
      )}
      {openAdd && model.isCurrentMonth ? (
        <Button variant="ghost" className={styles.todayAction} onPress={openAdd} type="button">
          <Icon name="plus" strokeWidth={2.2} />
          Log a payment
        </Button>
      ) : null}
    </section>
  );
}

function AttentionLine({ model }: { model: OverviewModel }) {
  const { compactAmount } = useAmountDisplay();
  const attention = model.attentionBudget;
  if (!attention) return "Every category is on track";
  const name = attention.budget.category;
  if (attention.state === "over")
    return (
      <>
        {name} is <strong data-amount>{compactAmount(-attention.remaining)}</strong> over
      </>
    );
  if (attention.state === "at-limit") return `${name} is at its limit`;
  return (
    <>
      {name} has <strong data-amount>{compactAmount(attention.remaining)}</strong> left
    </>
  );
}

function paceOf(model: OverviewModel) {
  if (model.budgetGuide) {
    if (model.budgetGuide.spending > model.budgetGuide.limit) return "over";
    return model.budgetGuide.percent > model.elapsedPercent ? "ahead" : "on-track";
  }
  if (model.overBudgetCount > 0) return "over";
  return model.percent > model.elapsedPercent ? "ahead" : "on-track";
}

function SafeToSpendSetup({ openBudgets }: { openBudgets: () => void }) {
  return (
    <Button
      variant="ghost"
      className={styles.safe}
      data-home-card="safe"
      onPress={openBudgets}
      type="button"
    >
      <span className={styles.featureName}>
        <SectionLabel icon="budgets">Daily budget guide</SectionLabel>
      </span>
      <strong className={styles.safeEmpty}>Set monthly budgets</strong>
      <span className={styles.safeNote}>Monara will turn them into a daily spending guide.</span>
    </Button>
  );
}

// Explains the headline: the daily split this month, or the budget total for a past month.
function BudgetGuideNote({ month, model }: { month: string; model: OverviewModel }) {
  const { formatRupiah } = useAmountDisplay();
  const guide = model.budgetGuide;
  if (!guide) {
    return (
      <span className={styles.safeNote}>
        of <strong data-amount>{formatRupiah(model.budgetTotal)}</strong>{" "}
        {model.calendarBudgetPeriods
          ? `in ${monthName(month)} budgets`
          : "across your budget periods"}
      </span>
    );
  }
  if (guide.shortfall > BigInt(0)) {
    return (
      <span className={styles.safeNote}>
        Budgeted categories are <strong data-amount>{formatRupiah(guide.shortfall)}</strong> over
        their limits.
      </span>
    );
  }
  return (
    <span className={styles.safeNote}>
      <strong data-amount>{formatRupiah(guide.remaining)}</strong> left in monthly budgets ÷{" "}
      {guide.daysLeft} {guide.daysLeft === 1 ? "day" : "days"}, including today
    </span>
  );
}

function OverallSpendingEstimate({ model }: { model: OverviewModel }) {
  const { formatRupiah } = useAmountDisplay();
  const guide = model.budgetGuide;
  const safe = model.safeToSpend;
  if (!guide || !safe || safe.perDay === guide.perDay) return null;
  return (
    <span className={styles.safeNote}>
      Across all spending: <strong data-amount>{formatRupiah(safe.perDay)}</strong>/day
    </span>
  );
}

function BudgetGuidePace({ model }: { model: OverviewModel }) {
  const guide = model.budgetGuide;
  const percent = guide?.percent ?? model.percent;
  const hasCalendarProgress = model.isCurrentMonth && model.calendarBudgetPeriods;
  return (
    <>
      <span
        aria-hidden
        className={styles.pace}
        data-pace={model.calendarBudgetPeriods ? paceOf(model) : undefined}
      >
        <span className={styles.paceFill} style={{ width: `${Math.min(percent, 100)}%` }} />
        {hasCalendarProgress ? (
          <span className={styles.paceMarker} style={{ left: `${model.elapsedPercent}%` }} />
        ) : null}
      </span>
      <span className={styles.paceCaption}>
        <span>
          <strong>{percent}%</strong> of budgets used
          {hasCalendarProgress ? ` · ${model.elapsedPercent}% of month gone` : ""}
        </span>
        {!guide ? (
          <span data-state={model.attentionBudget?.state ?? "on-track"}>
            <AttentionLine model={model} />
          </span>
        ) : null}
      </span>
    </>
  );
}

// Category allowance and overall estimate keep their different spending scopes visible.
function SafeToSpendCard({
  month,
  model,
  openBudgets,
}: {
  month: string;
  model: OverviewModel;
  openBudgets: () => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  if (model.budgetTotal === BigInt(0)) return <SafeToSpendSetup openBudgets={openBudgets} />;
  const guide = model.budgetGuide;
  return (
    <Button
      variant="ghost"
      className={styles.safe}
      data-home-card="safe"
      onPress={openBudgets}
      type="button"
    >
      <span className={styles.featureName}>
        <SectionLabel icon="budgets">{guide ? "Daily budget guide" : "Budgets left"}</SectionLabel>
      </span>
      <span className={styles.safeAmount}>
        <strong data-amount>{formatRupiah(guide ? guide.perDay : model.remaining)}</strong>
        {guide ? <small>/day</small> : null}
      </span>
      <BudgetGuideNote model={model} month={month} />
      <OverallSpendingEstimate model={model} />
      <BudgetGuidePace model={model} />
    </Button>
  );
}

type Tone = "danger" | "warning" | "accent";
type AttentionCopy = { tone: Tone; icon: IconName; title: string; detail: string };

function billCopy(
  item: Extract<AttentionItem, { kind: "bill-due" | "bill-overdue" }>,
  display: ReturnType<typeof useAmountDisplay>,
): AttentionCopy {
  const { formatRupiah } = display;
  const { bill, days } = item;
  const amount = formatRupiah(bill.expectedAmount);
  if (item.kind === "bill-overdue") {
    return {
      tone: "danger",
      icon: "calendar",
      title: `${bill.merchant} is overdue`,
      detail: `Was due ${formatDay(bill.nextDue)} · ${amount}`,
    };
  }
  let when = `due in ${days} days`;
  if (days === 0) when = "due today";
  else if (days === 1) when = "due tomorrow";
  return {
    tone: "accent",
    icon: "calendar",
    title: `${bill.merchant} is ${when}`,
    detail: `${formatDay(bill.nextDue)} · ${amount}`,
  };
}

function budgetCopy(
  item: Extract<AttentionItem, { kind: "budget" }>,
  display: ReturnType<typeof useAmountDisplay>,
): AttentionCopy {
  const { compactAmount } = display;
  const { budget, state, used, limit, remaining } = item.usage;
  if (state === "over") {
    return {
      tone: "danger",
      icon: "budgets",
      title: `${budget.category} is over budget`,
      detail: `${compactAmount(-remaining)} over its ${compactAmount(limit)} limit`,
    };
  }
  return {
    tone: "warning",
    icon: "budgets",
    title:
      state === "at-limit"
        ? `${budget.category} is at its limit`
        : `${budget.category} is close to its limit`,
    detail:
      state === "at-limit"
        ? `${compactAmount(used)} of ${compactAmount(limit)} used`
        : `${compactAmount(remaining)} left of ${compactAmount(limit)}`,
  };
}

function attentionCopy(
  item: AttentionItem,
  display: ReturnType<typeof useAmountDisplay>,
): AttentionCopy {
  if (item.kind === "budget") return budgetCopy(item, display);
  if (item.kind === "review") {
    return {
      tone: "accent",
      icon: "inbox",
      title: `${item.count} ${item.count === 1 ? "import" : "imports"} to review`,
      detail: "They count once you confirm them",
    };
  }
  return billCopy(item, display);
}

function attentionKey(item: AttentionItem) {
  if (item.kind === "budget") return `budget-${item.usage.budget.id}`;
  if (item.kind === "review") return "review";
  return `${item.kind}-${item.bill.id}`;
}

// Overdue bills, budgets past their limit, bills due this week and imports waiting.
function AttentionCard({
  items,
  openBudgets,
  openReview,
}: {
  items: AttentionItem[];
  openBudgets: () => void;
  openReview: () => void;
}) {
  const display = useAmountDisplay();
  return (
    <section
      aria-labelledby="attention-title"
      className={`${styles.attention} ${styles.slotAttention}`}
      data-home-card="attention"
    >
      <SectionTitle className={styles.cardLabel} icon="bell" id="attention-title">
        Needs attention
      </SectionTitle>
      {items.length === 0 ? (
        <p className={styles.allClear}>
          <span aria-hidden className={styles.alertIcon} data-tone="success">
            <Icon name="check" strokeWidth={2.4} />
          </span>
          Nothing needs attention in the records shown.
        </p>
      ) : (
        <ul className={styles.alerts}>
          {items.slice(0, 5).map((item) => {
            const copy = attentionCopy(item, display);
            return (
              <li key={attentionKey(item)}>
                <Button
                  variant="ghost"
                  className={styles.alert}
                  onPress={item.kind === "review" ? openReview : openBudgets}
                  type="button"
                >
                  <span aria-hidden className={styles.alertIcon} data-tone={copy.tone}>
                    <Icon name={copy.icon} />
                  </span>
                  <span className={styles.alertBody}>
                    <strong>{copy.title}</strong>
                    <span data-amount>{copy.detail}</span>
                  </span>
                  <Icon aria-hidden className={styles.alertArrow} name="chevron-right" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Fact({
  icon,
  tone,
  children,
  onOpen,
}: {
  icon: IconName;
  tone?: "up" | "down";
  children: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <Button variant="ghost" className={styles.fact} onPress={onOpen} type="button">
        <span aria-hidden className={styles.factIcon} data-tone={tone}>
          <Icon name={icon} />
        </span>
        <span className={styles.factText}>{children}</span>
        <Icon aria-hidden className={styles.alertArrow} name="chevron-right" />
      </Button>
    </li>
  );
}

function BackendInsightsCard({
  insights,
  transactions,
  openBudgets,
  openTransaction,
}: {
  insights?: FinancialInsights;
  transactions: Transaction[];
  openBudgets: () => void;
  openTransaction: (transaction: Transaction) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const matchedUnusualTransactions =
    insights?.unusualTransactions
      .flatMap((flag) => {
        const transaction = transactions.find((item) => item.id === flag.transactionId);
        return transaction ? [{ flag, transaction }] : [];
      })
      .slice(0, 2) ?? [];
  if (
    !insights ||
    (insights.overspendForecasts.length === 0 && matchedUnusualTransactions.length === 0)
  ) {
    return null;
  }
  return (
    <section
      aria-labelledby="backend-insights-title"
      className={`${styles.attention} ${styles.slotFlags}`}
      data-home-card="flags"
    >
      <SectionTitle className={styles.cardLabel} icon="sparkle" id="backend-insights-title">
        Forecasts and flags
      </SectionTitle>
      <ul className={styles.alerts}>
        {insights.overspendForecasts.slice(0, 2).map((forecast) => (
          <Fact icon="trend-up" key={forecast.budgetId} onOpen={openBudgets} tone="down">
            <strong>{forecast.categoryName}</strong> may exceed its budget by{" "}
            <strong data-amount>
              {formatRupiah(BigInt(forecast.projectedOverspend.amountMinor))}
            </strong>
            {`. ${formatRupiah(BigInt(forecast.spending.amountMinor))} spent in ${forecast.elapsedDays} of ${forecast.periodDays} days; projected ${formatRupiah(BigInt(forecast.projectedSpending.amountMinor))} vs ${formatRupiah(BigInt(forecast.limit.amountMinor))} limit`}
          </Fact>
        ))}
        {matchedUnusualTransactions.map(({ flag, transaction }) => (
          <Fact
            icon="sparkle"
            key={flag.transactionId}
            onOpen={() => openTransaction(transaction)}
            tone="down"
          >
            <strong>{transaction.merchant ?? "Payment"}</strong> at{" "}
            <strong data-amount>{formatRupiah(BigInt(flag.amount.amountMinor))}</strong> is{" "}
            {flag.multipleOfMedian}× the {flag.categoryName} median of{" "}
            <strong data-amount>{formatRupiah(BigInt(flag.historyMedian.amountMinor))}</strong>
            {` across ${flag.historyTransactionCount} earlier payments`}
          </Fact>
        ))}
      </ul>
    </section>
  );
}

export function MobileOverview({
  setup,
  month,
  setMonth,
  today,
  model,
  insights,
  transactions,
  amountsHidden,
  toggleAmounts,
  openTransaction,
  openTransactions,
  openBudgets,
  openReview,
  openChat,
  openAdd,
  openConnectGmail,
}: {
  month: string;
  setMonth: (month: string) => void;
  today: string;
  model: OverviewModel;
  insights?: FinancialInsights;
  transactions: Transaction[];
  amountsHidden: boolean;
  toggleAmounts: () => void;
  openTransaction: (transaction: Transaction) => void;
  openTransactions?: () => void;
  openBudgets: () => void;
  openReview: () => void;
  openChat: (prompt?: string) => void;
  openAdd?: () => void;
  openConnectGmail?: () => void;
  setup?: ReactNode;
}) {
  return (
    <div className={styles.home}>
      <SceneHero
        amountsHidden={amountsHidden}
        model={model}
        month={month}
        openChat={openChat}
        today={today}
        toggleAmounts={toggleAmounts}
      />

      <div className={styles.sheet}>
        {setup}
        <div className={styles.columns}>
          <div className={styles.lead}>
            {model.isCurrentMonth ? (
              <div className={styles.slotForecast}>
                <SpendingForecastCard month={month} today={today} transactions={transactions} />
              </div>
            ) : null}
            {model.isCurrentMonth || model.recent.length > 0 ? (
              <div className={styles.slotActivity}>
                <ActivityCard
                  model={model}
                  month={month}
                  openAdd={openAdd}
                  openTransaction={openTransaction}
                  openTransactions={openTransactions}
                />
              </div>
            ) : null}
            <div className={styles.slotWhere}>
              <SpendingBlock
                model={model}
                month={month}
                openAdd={openAdd}
                openConnectGmail={openConnectGmail}
                openReview={openReview}
                openTransaction={openTransaction}
                setMonth={setMonth}
                today={today}
                transactions={transactions}
              />
            </div>
          </div>
          <div className={styles.aside}>
            <div className={styles.slotSafe}>
              <SafeToSpendCard model={model} month={month} openBudgets={openBudgets} />
            </div>
            <BackendInsightsCard
              insights={insights}
              openBudgets={openBudgets}
              openTransaction={openTransaction}
              transactions={transactions}
            />
            {model.isCurrentMonth ? (
              <AttentionCard
                items={model.attention}
                openBudgets={openBudgets}
                openReview={openReview}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

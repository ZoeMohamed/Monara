"use client";

import Image from "next/image";
import { type CSSProperties, type ReactNode, useId, useState, useSyncExternalStore } from "react";

import { Icon, type IconName } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";
import { TransactionRow } from "@/components/transaction-row";
import { categoryColor, categoryIcon } from "@/data/category-style";
import {
  daysBetween,
  formatMonth,
  formatRupiah,
  type RecurringBill,
  shiftMonth,
  type Transaction,
} from "@/data/demo-ledger";
import {
  categoryContainsTransaction,
  categoryKey,
  categoryMatchesBudget,
  chartRatio,
  compactAmount,
  financialMonth,
} from "@/data/finance-analytics";
import { type overviewModel, type SceneTime, sceneTime } from "@/data/overview-model";

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

function budgetLeftOf(model: OverviewModel) {
  return model.safeToSpend?.remaining ?? model.remaining;
}

function Chip({
  icon,
  tone,
  children,
  onClick,
  label,
}: {
  icon: IconName;
  tone?: "up" | "down" | "accent";
  children: ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button aria-label={label} className={styles.chip} onClick={onClick} type="button">
      <span aria-hidden className={styles.chipIcon} data-tone={tone}>
        <Icon name={icon} strokeWidth={2.2} />
      </span>
      <span>{children}</span>
    </button>
  );
}

function ComparisonChip({
  comparison,
  onOpen,
}: {
  comparison: OverviewModel["comparison"];
  onOpen: () => void;
}) {
  if (comparison.state !== "available") return null;
  const difference = comparison.current - comparison.previous;
  const size = difference < BigInt(0) ? -difference : difference;
  const previous = monthName(comparison.previousMonth);
  const direction = difference > BigInt(0) ? "more" : "less";
  return (
    <Chip
      icon={difference > BigInt(0) ? "trend-up" : "trend-down"}
      label={`${difference === BigInt(0) ? "Same as" : `${formatRupiah(size)} ${direction} than`} ${previous}. Open reports`}
      onClick={onOpen}
      tone={difference > BigInt(0) ? "up" : "down"}
    >
      {difference === BigInt(0)
        ? `Same as ${previous}`
        : `${compactAmount(size)} ${direction} than ${previous.slice(0, 3)}`}
    </Chip>
  );
}

function SceneHero({
  month,
  today,
  model,
  amountsHidden,
  toggleAmounts,
  openChat,
  openReview,
  openBudgets,
  openReports,
}: {
  month: string;
  today: string;
  model: OverviewModel;
  amountsHidden: boolean;
  toggleAmounts: () => void;
  openChat: (prompt?: string) => void;
  openReview: () => void;
  openBudgets: () => void;
  openReports: () => void;
}) {
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
          <button
            aria-label={amountsHidden ? "Show amounts" : "Hide amounts"}
            aria-pressed={amountsHidden}
            className={styles.eye}
            onClick={toggleAmounts}
            type="button"
          >
            <Icon name={amountsHidden ? "eye-off" : "eye"} />
          </button>
        </div>
        <p className={styles.caption}>
          {monthName(month)} spending
          {model.isCurrentMonth ? ` · day ${model.currentDay}` : ""}
        </p>

        <div className={styles.askWrap} data-tour="ask">
          <MonaraMascot className={styles.mascot} />
          <button
            aria-label="Ask Monara anything"
            className={styles.ask}
            onClick={() => openChat()}
            type="button"
          >
            <span aria-hidden className={styles.askPaw}>
              <Icon name="chat" />
            </span>
            <span className={styles.askLabel}>Ask Monara anything</span>
            <span aria-hidden className={styles.askArrow}>
              <Icon name="send" strokeWidth={2.4} />
            </span>
          </button>
        </div>

        <SceneChips
          model={model}
          openReview={openReview}
          openBudgets={openBudgets}
          openReports={openReports}
        />
      </div>
    </section>
  );
}

function SceneChips({
  model,
  openReview,
  openBudgets,
  openReports,
}: {
  model: OverviewModel;
  openReview: () => void;
  openBudgets: () => void;
  openReports: () => void;
}) {
  const quiet =
    model.pendingCount === 0 &&
    model.upcomingBillCount === 0 &&
    model.comparison.state !== "available";
  return (
    <div className={styles.chips} data-tour="chips">
      {model.pendingCount > 0 ? (
        <Chip icon="inbox" onClick={openReview} tone="accent">
          {model.pendingCount} to review
        </Chip>
      ) : null}
      {model.upcomingBillCount > 0 ? (
        <Chip icon="calendar" onClick={openBudgets}>
          {model.upcomingBillCount} {model.upcomingBillCount === 1 ? "bill" : "bills"} this week
        </Chip>
      ) : null}
      <ComparisonChip comparison={model.comparison} onOpen={openReports} />
      {quiet ? (
        <Chip icon="budgets" onClick={openBudgets}>
          {compactAmount(budgetLeftOf(model))} budget left
        </Chip>
      ) : null}
    </div>
  );
}

function CategoryItem({
  name,
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
  const over = budgetLimit !== null && amount > budgetLimit;
  return (
    <li>
      <button
        aria-controls={open ? paymentsId : undefined}
        aria-expanded={open}
        aria-label={`${name}, ${formatRupiah(amount)}${budgetLimit !== null ? ` of ${formatRupiah(budgetLimit)} budget${over ? ", over budget" : ""}` : ""}. Show payments.`}
        className={styles.category}
        onClick={onToggle}
        style={{ "--category-color": categoryColor(name, index) } as CSSProperties}
        type="button"
      >
        <span aria-hidden className={styles.categoryIcon}>
          <Icon name={categoryIcon(name)} />
        </span>
        <span className={styles.categoryBody}>
          <span className={styles.categoryLabel}>
            <strong>{name}</strong>
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
          {budgetLimit !== null ? (
            <span className={styles.budgetCaption}>
              {over ? "Over · " : "of "}
              <span data-amount>{compactAmount(budgetLimit)}</span>
            </span>
          ) : null}
        </span>
      </button>
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
    <section aria-labelledby="spending-title" className={styles.block}>
      <div className={styles.blockHead}>
        <h2 className={styles.quiet} id="spending-title">
          Where it went
        </h2>
        <label className={styles.monthPicker} htmlFor={monthId}>
          <span className="sr-only">Month</span>
          <select id={monthId} onChange={(event) => setMonth(event.target.value)} value={month}>
            {months.map((value) => (
              <option key={value} value={value}>
                {value === currentMonth ? "This month" : formatMonth(value)}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" strokeWidth={2.2} />
        </label>
      </div>

      {categories.length === 0 ? (
        <div className={styles.empty}>
          <MonaraMascot className={styles.emptyMascot} />
          <p>
            <strong>{model.emptyTitle}</strong>
            Add a payment or bring in receipts from Gmail.
          </p>
          <div>
            {openAdd ? (
              <button className={styles.primary} onClick={openAdd} type="button">
                <Icon name="plus" strokeWidth={2.2} />
                Add payment
              </button>
            ) : null}
            {model.pendingCount > 0 ? (
              <button className={styles.secondary} onClick={openReview} type="button">
                Review {model.pendingCount}
              </button>
            ) : openConnectGmail ? (
              <button className={styles.secondary} onClick={openConnectGmail} type="button">
                Connect Gmail
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className={styles.categoryList}>
          {categories.map((category, index) => {
            const key = categoryKey(category);
            const budget = model.usage.find((item) => categoryMatchesBudget(category, item.budget));
            return (
              <CategoryItem
                amount={category.amount}
                budgetLimit={budget?.limit ?? null}
                index={index}
                key={key}
                name={category.name}
                onToggle={() => setSelection(selected === key ? null : { month, category: key })}
                open={selected === key}
                openTransaction={openTransaction}
                payments={model.summary.confirmed.filter(
                  (item) => item.kind === "expense" && categoryContainsTransaction(category, item),
                )}
                paymentsId={paymentsId}
                scale={budget?.limit ?? categories[0].amount}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TodayCard({
  today,
  model,
  openTransaction,
  openAdd,
}: {
  today: string;
  model: OverviewModel;
  openTransaction: (transaction: Transaction) => void;
  openAdd?: () => void;
}) {
  const records = model.summary.confirmed.filter(
    (item) => item.date === today && item.kind !== "transfer",
  );
  return (
    <section aria-labelledby="today-title" className={styles.todayCard}>
      <h2 id="today-title">
        {records.length > 0 ? (
          <>
            <span data-amount>{compactAmount(model.todaySpending)}</span> today
          </>
        ) : (
          "No payments yet today"
        )}
      </h2>
      {records.length > 0 ? (
        <ul>
          {records.slice(0, 3).map((item) => (
            <li key={item.id}>
              <TransactionRow onClick={() => openTransaction(item)} transaction={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p>Paid in cash? Log it in seconds.</p>
      )}
      {openAdd ? (
        <button className={styles.todayAction} onClick={openAdd} type="button">
          <Icon name="plus" strokeWidth={2.2} />
          Log a payment
        </button>
      ) : null}
    </section>
  );
}

function Feature({
  name,
  icon,
  tone,
  value,
  hint,
  onOpen,
  amount = false,
}: {
  name: string;
  icon: IconName;
  tone: "green" | "violet" | "blue" | "amber" | "red";
  value: string;
  hint: string;
  onOpen: () => void;
  amount?: boolean;
}) {
  return (
    <button onClick={onOpen} type="button">
      <span className={styles.featureName}>
        <span aria-hidden className={styles.featureIcon} data-tone={tone}>
          <Icon name={icon} />
        </span>
        {name}
      </span>
      <strong data-amount={amount || undefined}>{value}</strong>
      <span className={styles.featureHint}>{hint}</span>
    </button>
  );
}

function attentionLine(model: OverviewModel) {
  const attention = model.attentionBudget;
  if (!attention) return "Every category is on track";
  const name = attention.budget.category;
  if (attention.state === "over") return `${name} is ${compactAmount(-attention.remaining)} over`;
  if (attention.state === "at-limit") return `${name} is at its limit`;
  return `${name} has ${compactAmount(attention.remaining)} left`;
}

function paceOf(model: OverviewModel) {
  if (model.overBudgetCount > 0) return "over";
  return model.percent > model.elapsedPercent ? "ahead" : "on-track";
}

function SafeToSpendSetup({ openBudgets }: { openBudgets: () => void }) {
  return (
    <button className={styles.safe} onClick={openBudgets} type="button">
      <span className={styles.featureName}>
        <span aria-hidden className={styles.featureIcon} data-tone="green">
          <Icon name="budgets" />
        </span>
        Safe to spend today
      </span>
      <strong className={styles.safeEmpty}>Set monthly budgets</strong>
      <span className={styles.safeNote}>Monara will turn them into a daily spending guide.</span>
    </button>
  );
}

// Explains the headline: the daily split this month, or the budget total for a past month.
function SafeToSpendNote({ month, model }: { month: string; model: OverviewModel }) {
  const safe = model.safeToSpend;
  if (!safe) {
    return (
      <span className={styles.safeNote}>
        of <strong data-amount>{formatRupiah(model.budgetTotal)}</strong> in {monthName(month)}{" "}
        budgets
      </span>
    );
  }
  if (safe.shortfall > BigInt(0)) {
    return (
      <span className={styles.safeNote}>
        Spending is <strong data-amount>{formatRupiah(safe.shortfall)}</strong> over your total
        limits.
      </span>
    );
  }
  return (
    <span className={styles.safeNote}>
      <strong data-amount>{formatRupiah(safe.remaining)}</strong> left in budgets ÷ {safe.daysLeft}{" "}
      {safe.daysLeft === 1 ? "day" : "days"}, including today
    </span>
  );
}

// The daily guide: what can still be spent today without breaking the month's total limits.
function SafeToSpendCard({
  month,
  model,
  openBudgets,
}: {
  month: string;
  model: OverviewModel;
  openBudgets: () => void;
}) {
  if (model.budgetTotal === BigInt(0)) return <SafeToSpendSetup openBudgets={openBudgets} />;
  const safe = model.safeToSpend;
  return (
    <button className={styles.safe} onClick={openBudgets} type="button">
      <span className={styles.featureName}>
        <span aria-hidden className={styles.featureIcon} data-tone="green">
          <Icon name="budgets" />
        </span>
        {safe ? "Safe to spend today" : "Budgets left"}
      </span>
      <span className={styles.safeAmount}>
        <strong data-amount>{formatRupiah(safe ? safe.perDay : model.remaining)}</strong>
        {safe ? <small>/day</small> : null}
      </span>
      <SafeToSpendNote model={model} month={month} />
      <span aria-hidden className={styles.pace} data-pace={paceOf(model)}>
        <span className={styles.paceFill} style={{ width: `${Math.min(model.percent, 100)}%` }} />
        {model.isCurrentMonth ? (
          <span className={styles.paceMarker} style={{ left: `${model.elapsedPercent}%` }} />
        ) : null}
      </span>
      <span className={styles.paceCaption}>
        <span>
          <strong>{model.percent}%</strong> of budgets used
          {model.isCurrentMonth ? ` · ${model.elapsedPercent}% of month gone` : ""}
        </span>
        <span data-state={model.attentionBudget?.state ?? "on-track"}>{attentionLine(model)}</span>
      </span>
    </button>
  );
}

function FeatureGrid({
  today,
  model,
  bills,
  openBudgets,
  openReports,
  openReview,
  openConnectGmail,
  showBills,
}: {
  today: string;
  model: OverviewModel;
  bills: RecurringBill[];
  openBudgets: () => void;
  openReports: () => void;
  openReview: () => void;
  openConnectGmail?: () => void;
  showBills: boolean;
}) {
  const nextBill = model.nextBill;
  const nextBillDays = nextBill ? daysBetween(today, nextBill.nextDue) : null;
  let billValue = `${bills.filter((bill) => bill.status === "active").length} tracked`;
  if (nextBill && nextBillDays === 0) billValue = `${nextBill.merchant} today`;
  else if (nextBill) billValue = `${nextBill.merchant} in ${nextBillDays}d`;

  return (
    <section aria-labelledby="features-title" className={styles.features}>
      <h2 className="sr-only" id="features-title">
        Your features
      </h2>
      <div className={styles.featureGrid}>
        {showBills ? (
          <Feature
            hint={nextBill ? "Coming up this week" : "Nothing due this week"}
            icon="calendar"
            name="Bills"
            onOpen={openBudgets}
            tone="violet"
            value={billValue}
          />
        ) : null}
        <Feature
          amount
          hint={
            model.savingsRate === null
              ? "Daily trend and categories"
              : `${model.savingsRate}% of income kept`
          }
          icon="reports"
          name="Reports"
          onOpen={openReports}
          tone="blue"
          value={`${compactAmount(model.summary.spending)} out`}
        />
        <Feature
          hint="Imports count once you confirm"
          icon="inbox"
          name="Review"
          onOpen={openReview}
          tone="amber"
          value={model.pendingCount > 0 ? `${model.pendingCount} waiting` : "All clear"}
        />
        {openConnectGmail ? (
          <Feature
            hint="Up to 3 mailboxes"
            icon="mail"
            name="Gmail"
            onOpen={openConnectGmail}
            tone="red"
            value="Import receipts"
          />
        ) : null}
      </div>
    </section>
  );
}

export function MobileOverview({
  setup,
  month,
  setMonth,
  today,
  model,
  transactions,
  bills,
  amountsHidden,
  toggleAmounts,
  openTransaction,
  openReports,
  openBudgets,
  openReview,
  openChat,
  openAdd,
  openConnectGmail,
  showBills = true,
}: {
  month: string;
  setMonth: (month: string) => void;
  today: string;
  model: OverviewModel;
  transactions: Transaction[];
  bills: RecurringBill[];
  amountsHidden: boolean;
  toggleAmounts: () => void;
  openTransaction: (transaction: Transaction) => void;
  openReports: () => void;
  openBudgets: () => void;
  openReview: () => void;
  openChat: (prompt?: string) => void;
  openAdd?: () => void;
  openConnectGmail?: () => void;
  showBills?: boolean;
  setup?: ReactNode;
}) {
  return (
    <div className={styles.home}>
      <SceneHero
        amountsHidden={amountsHidden}
        model={model}
        month={month}
        openBudgets={openBudgets}
        openChat={openChat}
        openReports={openReports}
        openReview={openReview}
        today={today}
        toggleAmounts={toggleAmounts}
      />

      <div className={styles.sheet}>
        <nav aria-label="Ask Monara" className={styles.prompts}>
          {prompts.map((item) => (
            <button key={item.text} onClick={() => openChat(item.prompt)} type="button">
              <Icon name={item.icon} />
              {item.text}
            </button>
          ))}
        </nav>
        {setup}
        <div className={styles.columns}>
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
          <div className={styles.aside}>
            <SafeToSpendCard model={model} month={month} openBudgets={openBudgets} />
            {model.isCurrentMonth ? (
              <TodayCard
                model={model}
                openAdd={openAdd}
                openTransaction={openTransaction}
                today={today}
              />
            ) : null}
            <FeatureGrid
              showBills={showBills}
              bills={bills}
              model={model}
              openBudgets={openBudgets}
              openConnectGmail={openConnectGmail}
              openReports={openReports}
              openReview={openReview}
              today={today}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

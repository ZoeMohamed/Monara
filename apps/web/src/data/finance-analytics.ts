import {
  type Budget,
  daysInMonth,
  demoSummary,
  demoToday,
  earliestReportMonth,
  formatDay,
  formatMonth,
  isCalendarDate,
  shiftMonth,
  type Transaction,
} from "./demo-ledger";

type DailyFinance = {
  date: string;
  day: number;
  spending: bigint;
  income: bigint;
  cumulativeSpending: bigint;
  transactions: Transaction[];
  future: boolean;
};

type CategoryFinance = {
  name: string;
  icon?: string;
  categoryId?: string;
  amount: bigint;
  count: number;
};

type CategoryIdentity = Pick<CategoryFinance, "name" | "categoryId">;

// Owned categories use their UUID. Demo categories retain their existing name identity.
export function categoryKey(category: CategoryIdentity): string {
  return category.categoryId ?? category.name;
}

export function categoryContainsTransaction(category: CategoryIdentity, transaction: Transaction) {
  if (category.categoryId || transaction.categoryId) {
    return category.categoryId === transaction.categoryId;
  }
  return category.name === (transaction.category || "Uncategorized");
}

export function categoryMatchesBudget(category: CategoryIdentity, budget: Budget) {
  if (category.categoryId || budget.categoryId) {
    return category.categoryId === budget.categoryId;
  }
  return category.name === budget.category;
}

// Convert only a bounded, display-only proportion. Monetary totals remain exact bigint values.
export function chartRatio(value: bigint, maximum: bigint): number {
  if (value <= BigInt(0) || maximum <= BigInt(0)) return 0;
  if (value >= maximum) return 1;
  return Number((value * BigInt(10000)) / maximum) / 10000;
}

export function financialMonth(transactions: Transaction[], month: string, today = demoToday) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(`${month}-01`)) {
    throw new Error("Choose a valid calendar month.");
  }
  const summary = demoSummary(transactions, month);
  const records = summary.confirmed.filter(
    (transaction) => transaction.kind === "expense" || transaction.kind === "income",
  );
  const groupedDays = new Map<string, Transaction[]>();
  const groupedCategories = new Map<string, CategoryFinance>();
  for (const transaction of records) {
    const date = transaction.date;
    if (!date) continue;
    const dateRecords = groupedDays.get(date) ?? [];
    dateRecords.push(transaction);
    groupedDays.set(date, dateRecords);
    if (transaction.kind === "expense") {
      const name = transaction.category || "Uncategorized";
      const key = transaction.categoryId ? `id:${transaction.categoryId}` : `name:${name}`;
      const category = groupedCategories.get(key) ?? {
        name,
        ...(transaction.categoryIcon ? { icon: transaction.categoryIcon } : {}),
        ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
        amount: BigInt(0),
        count: 0,
      };
      category.amount += BigInt(transaction.amount ?? 0);
      category.count += 1;
      groupedCategories.set(key, category);
    }
  }

  let cumulativeSpending = BigInt(0);
  let maxDailySpending = BigInt(0);
  const days: DailyFinance[] = Array.from({ length: daysInMonth(month) }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const dayTransactions = groupedDays.get(date) ?? [];
    let spending = BigInt(0);
    let income = BigInt(0);
    for (const transaction of dayTransactions) {
      if (transaction.kind === "expense") spending += BigInt(transaction.amount ?? 0);
      if (transaction.kind === "income") income += BigInt(transaction.amount ?? 0);
    }
    cumulativeSpending += spending;
    if (spending > maxDailySpending) maxDailySpending = spending;
    return {
      date,
      day,
      spending,
      income,
      cumulativeSpending,
      transactions: dayTransactions,
      future: date > today,
    };
  });

  return {
    month,
    spending: summary.spending,
    income: summary.income,
    difference: summary.difference,
    confirmedCount: records.length,
    days,
    categories: Array.from(groupedCategories.values()).sort((left, right) =>
      left.amount === right.amount
        ? left.name.localeCompare(right.name)
        : left.amount > right.amount
          ? -1
          : 1,
    ),
    maxDailySpending,
    activeDays: days.filter((day) => day.spending > BigInt(0)).length,
    // Monday is column zero, independent of the browser's timezone.
    calendarOffset: (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7,
  };
}

// Display-only short amounts such as Rp397.4k. Exact amounts stay in labels and lists.
export function compactAmount(amount: bigint, showFraction = true): string {
  const sign = amount < BigInt(0) ? "-" : "";
  const value = amount < BigInt(0) ? -amount : amount;
  const unit = [
    { divisor: BigInt(1000000000000), label: "t" },
    { divisor: BigInt(1000000000), label: "b" },
    { divisor: BigInt(1000000), label: "m" },
    { divisor: BigInt(1000), label: "k" },
  ].find((candidate) => value >= candidate.divisor);
  if (!unit) return `${sign}Rp${value}`;
  const tenth = (value * BigInt(10)) / unit.divisor;
  const fraction = tenth % BigInt(10);
  return `${sign}Rp${tenth / BigInt(10)}${showFraction && fraction > BigInt(0) ? `.${fraction}` : ""}${unit.label}`;
}

// Compares like with like: the current month to date against the same days of the previous month.
export function monthComparison(transactions: Transaction[], month: string, today = demoToday) {
  if (!isCalendarDate(today)) throw new Error("Choose a valid comparison date.");
  const current = financialMonth(transactions, month, today);
  const previous = financialMonth(transactions, shiftMonth(month, -1), today);
  const throughDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : null;
  const previousDay = Math.min(throughDay ?? previous.days.length, previous.days.length);
  const hasBaseline = previous.days
    .slice(0, previousDay)
    .some((day) => day.transactions.some((transaction) => transaction.kind === "expense"));
  const state: "available" | "no-baseline" | "future" =
    month > today.slice(0, 7) ? "future" : hasBaseline ? "available" : "no-baseline";
  return {
    state,
    previousMonth: previous.month,
    throughDay,
    current: throughDay ? current.days[throughDay - 1].cumulativeSpending : current.spending,
    previous: previous.days[previousDay - 1].cumulativeSpending,
  };
}

export function cashFlowMonths(transactions: Transaction[], month: string) {
  // Validate before passing the month to the calendar helper.
  financialMonth([], month);
  if (month < earliestReportMonth) {
    throw new Error("Choose a valid calendar month with five earlier months available.");
  }
  return Array.from({ length: 6 }, (_, index) => {
    const period = shiftMonth(month, index - 5);
    const { income, spending, difference, confirmedCount } = financialMonth(transactions, period);
    return { month: period, income, spending, difference, confirmedCount };
  });
}

/** Twelve real calendar months; only valid confirmed income and expense enter totals. */
export function financialYear(transactions: Transaction[], year: string, today = demoToday) {
  if (!/^\d{4}$/.test(year) || !isCalendarDate(`${year}-01-01`)) {
    throw new Error("Choose a valid calendar year.");
  }
  const months = Array.from({ length: 12 }, (_, index) =>
    financialMonth(transactions, `${year}-${String(index + 1).padStart(2, "0")}`, today),
  );
  const confirmed = months.flatMap((period) => demoSummary(transactions, period.month).confirmed);
  const categories = new Map<string, CategoryFinance>();
  for (const month of months) {
    for (const category of month.categories) {
      const key = categoryKey(category);
      const previous = categories.get(key);
      categories.set(key, {
        ...category,
        amount: (previous?.amount ?? BigInt(0)) + category.amount,
        count: (previous?.count ?? 0) + category.count,
      });
    }
  }
  const spending = months.reduce((total, month) => total + month.spending, BigInt(0));
  const income = months.reduce((total, month) => total + month.income, BigInt(0));
  return {
    year,
    spending,
    income,
    difference: income - spending,
    confirmed,
    months,
    categories: Array.from(categories.values()).sort((left, right) =>
      left.amount === right.amount
        ? left.name.localeCompare(right.name, "en-US")
        : left.amount > right.amount
          ? -1
          : 1,
    ),
  };
}

/** Current-year comparisons stop on the same month/day; February 29 caps at February 28. */
export function yearComparison(transactions: Transaction[], year: string, today = demoToday) {
  if (!isCalendarDate(today)) throw new Error("Choose a valid comparison date.");
  const current = financialYear(transactions, year, today);
  const throughDate = year === today.slice(0, 4) ? today : null;
  const currentEnd = throughDate ?? `${year}-12-31`;
  const expensesThrough = (records: Transaction[], end: string) =>
    records.filter(
      (record) => record.kind === "expense" && record.date !== null && record.date <= end,
    );
  const sum = (records: Transaction[]) =>
    records.reduce((total, record) => total + BigInt(record.amount ?? 0), BigInt(0));
  const currentSpending = sum(expensesThrough(current.confirmed, currentEnd));
  if (year === "0000") {
    return {
      state: "no-baseline" as const,
      previousYear: null,
      throughDate,
      current: currentSpending,
      previous: BigInt(0),
    };
  }
  const previousYear = String(Number(year) - 1).padStart(4, "0");
  const previous = financialYear(transactions, previousYear, today);
  const previousMonth = `${previousYear}-${(throughDate ?? currentEnd).slice(5, 7)}`;
  const previousDay = Math.min(
    Number((throughDate ?? currentEnd).slice(8, 10)),
    daysInMonth(previousMonth),
  );
  const previousEnd = `${previousMonth}-${String(previousDay).padStart(2, "0")}`;
  const previousExpenses = expensesThrough(previous.confirmed, previousEnd);
  const state: "available" | "no-baseline" | "future" =
    year > today.slice(0, 4) ? "future" : previousExpenses.length > 0 ? "available" : "no-baseline";
  return {
    state,
    previousYear,
    throughDate,
    current: currentSpending,
    previous: sum(previousExpenses),
  };
}

export type FinancialSummaryModel = {
  label: string;
  spending: bigint;
  income: bigint;
  difference: bigint;
  comparison: {
    state: "available" | "no-baseline" | "future";
    change: bigint;
    previousLabel: string;
    basisLabel: string;
    caption: string | null;
  };
};

/** Common summary data, with honest comparison periods for both calendar scales. */
export function financialSummaryModel(
  transactions: Transaction[],
  period: string,
  today = demoToday,
): FinancialSummaryModel {
  if (/^\d{4}$/.test(period)) {
    const summary = financialYear(transactions, period, today);
    const comparison = yearComparison(transactions, period, today);
    return {
      label: period,
      spending: summary.spending,
      income: summary.income,
      difference: summary.difference,
      comparison: {
        state: comparison.state,
        change: comparison.current - comparison.previous,
        previousLabel: comparison.previousYear ?? "",
        basisLabel: comparison.throughDate
          ? `${period} from January 1 through ${formatDay(comparison.throughDate)}, compared with the same month and day in ${comparison.previousYear}; shorter Februarys end on February 28`
          : `${period}, compared with the full year ${comparison.previousYear}`,
        caption: comparison.throughDate ? `Jan–${formatDay(comparison.throughDate)}` : null,
      },
    };
  }
  const summary = demoSummary(transactions, period);
  const comparison = monthComparison(transactions, period, today);
  const days = comparison.throughDay;
  return {
    label: formatMonth(period),
    spending: summary.spending,
    income: summary.income,
    difference: summary.difference,
    comparison: {
      state: comparison.state,
      change: comparison.current - comparison.previous,
      previousLabel: formatMonth(comparison.previousMonth).split(" ")[0].slice(0, 3),
      basisLabel: days
        ? `${formatMonth(period)} days 1–${days}, compared with ${formatMonth(comparison.previousMonth)} days 1–${Math.min(days, daysInMonth(comparison.previousMonth))}`
        : `${formatMonth(period)}, compared with ${formatMonth(comparison.previousMonth)}`,
      caption: days ? `1–${days}` : null,
    },
  };
}

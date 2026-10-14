import {
  type Budget,
  budgetUsage,
  daysBetween,
  formatMonth,
  formatRupiah,
  type RecurringBill,
  safeToSpendToday,
  type Transaction,
  transactionErrors,
} from "./demo-ledger";

export type DemoContext = {
  transactions: Transaction[];
  budgets: Budget[];
  bills: RecurringBill[];
  today: string;
};

export type DemoReply = {
  reply: string;
  /** A confirmed cash expense the demo should add to its in-memory ledger. */
  log?: { merchant: string; amount: number };
};

const units: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
};

/** Reads "25rb", "28k", "1.5jt" or "25000" as whole rupiah; anything else is null. */
export function parseRupiah(value: string): number | null {
  if (value.length > 64) return null;
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(k|rb|ribu|jt|juta)?$/);
  if (!match) return null;
  let amount: bigint;
  if (match[2]) {
    if (!/^\d+(?:[.,]\d+)?$/.test(match[1])) return null;
    const [whole, fraction = ""] = match[1].split(/[.,]/);
    const scale = BigInt(10) ** BigInt(fraction.length);
    const scaled = BigInt(`${whole}${fraction}`) * BigInt(units[match[2]]);
    if (scaled % scale !== BigInt(0)) return null;
    amount = scaled / scale;
  } else {
    // A bare decimal is ambiguous; separators without a unit must group thousands.
    if (
      !/^\d+$/.test(match[1]) &&
      !/^\d{1,3}(?:\.\d{3})+$/.test(match[1]) &&
      !/^\d{1,3}(?:,\d{3})+$/.test(match[1])
    )
      return null;
    amount = BigInt(match[1].replace(/[.,]/g, ""));
  }
  return amount > BigInt(0) && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

function findAmount(text: string): number | null {
  const tokens =
    text.match(/(?<!\w)(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:ribu|juta|rb|jt|k)?(?!\w)/gi) ?? [];
  const amounts = tokens.map(parseRupiah).filter((amount) => amount !== null);
  return amounts.length === 1 ? amounts[0] : null;
}

function confirmedExpenses(context: DemoContext, from: string, to: string) {
  return context.transactions.filter(
    (item) =>
      item.status === "confirmed" &&
      Object.keys(transactionErrors(item)).length === 0 &&
      item.kind === "expense" &&
      item.date !== null &&
      item.date >= from &&
      item.date <= to,
  );
}

function sum(items: Transaction[]) {
  return items.reduce((total, item) => total + BigInt(item.amount ?? 0), BigInt(0));
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function categories(context: DemoContext) {
  const month = context.today.slice(0, 7);
  const totals = new Map<string, bigint>();
  for (const item of confirmedExpenses(context, `${month}-01`, context.today)) {
    const name = item.category || "Uncategorized";
    totals.set(name, (totals.get(name) ?? BigInt(0)) + BigInt(item.amount ?? 0));
  }
  return [...totals].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
}

/**
 * The demo assistant answers only from the sample ledger in memory. Every figure
 * is computed from those records, and it never pretends to be the real Agent.
 */
export function demoReply(text: string, context: DemoContext): DemoReply {
  const message = text.trim();
  const lower = message.toLowerCase();
  const month = context.today.slice(0, 7);
  const monthName = formatMonth(month).split(" ")[0];
  if (/\b(usd|eur|dollar|dollars|euro|euros)\b|[$€]/i.test(message)) {
    return { reply: "Use a rupiah amount like “25rb” or “Rp25.000”." };
  }
  const readOnlyRequest =
    /\?/.test(message) ||
    /^(can|could|should|how|what|where|when|why|is|are|do|does|did|will|would|berapa|apakah|bisa|boleh)\b/i.test(
      message,
    ) ||
    /\b(afford|beli|buy|bill|bills|due|tagihan|subscription|week|minggu|budget|budgets|where|went|spend|spent|category|categories|habis)\b/i.test(
      message,
    );
  const unsupportedDetails =
    /\b(income|salary|gaji|transfer|save|savings|deposit|delete|remove|undo|edit|change|receive|received|refund|yesterday|tomorrow|kemarin|besok|last|next|usd|eur|dollar|dollars|bca|gopay|jago|mandiri|via|using|rekening|account)\b/i.test(
      message,
    ) || /\d{4}-\d{2}-\d{2}/.test(message);

  // "kopi 25rb" / "coffee 28k": a short note ending in an amount logs a cash expense.
  const logMatch = message.match(
    /^(.{2,40}?)\s+((?:rp\.?\s?)?\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?)$/i,
  );
  const logAmount = logMatch ? parseRupiah(logMatch[2]) : null;
  if (logMatch && logAmount !== null && !readOnlyRequest && !unsupportedDetails) {
    const merchant = logMatch[1].replace(/^(log|add|paid|bayar)\s+/i, "").trim();
    if (/^(log|add|paid|bayar)$/i.test(merchant)) {
      return {
        reply: "Tell me what you paid for, like “kopi 25rb”, for a cash payment today.",
      };
    }
    const name = merchant.charAt(0).toUpperCase() + merchant.slice(1);
    return {
      reply: `Logged ${name} · ${formatRupiah(logAmount)} for today, paid in cash. It's in History, where you can add a category.`,
      log: { merchant: name, amount: logAmount },
    };
  }

  if (/afford|beli|buy/.test(lower)) {
    const amount = findAmount(message);
    const safe = safeToSpendToday(context.transactions, context.budgets, context.today);
    if (amount === null) {
      return {
        reply: `You have ${formatRupiah(safe.remaining)} of budget left this month, about ${formatRupiah(safe.perDay)} a day for ${safe.daysLeft} days. Tell me the price, like “Can I afford 300k?”`,
      };
    }
    const after = safe.remaining - BigInt(amount);
    return {
      reply:
        after >= BigInt(0)
          ? `Yes. ${formatRupiah(amount)} fits: you'd still have ${formatRupiah(after)} left this month, about ${formatRupiah(after / BigInt(safe.daysLeft))} a day.`
          : `Not comfortably. ${formatRupiah(amount)} is ${formatRupiah(-after)} more than the ${formatRupiah(safe.remaining)} left in this month's budgets.`,
    };
  }

  if (/bill|due|tagihan|subscription/.test(lower)) {
    const upcoming = context.bills
      .filter((bill) => bill.status === "active" && daysBetween(context.today, bill.nextDue) >= 0)
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
      .slice(0, 3);
    if (upcoming.length === 0) return { reply: "No tracked bills are coming up." };
    return {
      reply: `Coming up: ${upcoming
        .map((bill) => {
          const days = daysBetween(context.today, bill.nextDue);
          return `${bill.merchant} ${formatRupiah(bill.expectedAmount)} ${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}`;
        })
        .join(", ")}.`,
    };
  }

  if (/week|minggu/.test(lower)) {
    const from = shiftDate(context.today, -6);
    const items = confirmedExpenses(context, from, context.today);
    if (items.length === 0) return { reply: "No confirmed spending in the last 7 days." };
    const biggest = [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
    return {
      reply: `In the last 7 days you spent ${formatRupiah(sum(items))} across ${items.length} ${items.length === 1 ? "payment" : "payments"}. The biggest was ${biggest.merchant ?? "a payment"} at ${formatRupiah(biggest.amount ?? 0)}.`,
    };
  }

  if (/budget/.test(lower)) {
    const usage = context.budgets.map((budget) => ({
      budget,
      ...budgetUsage(context.transactions, budget, month, context.today),
    }));
    if (usage.length === 0) return { reply: "No budgets are set for this month." };
    const tight = usage.filter((item) => item.state !== "on-track");
    return {
      reply:
        tight.length === 0
          ? `All ${usage.length} budgets are on track this month.`
          : `${tight.map((item) => `${item.budget.category} is at ${item.percent}%`).join(", ")}. The rest are on track.`,
    };
  }

  if (/where|went|spend|spent|category|categories|habis/.test(lower)) {
    const spending = sum(confirmedExpenses(context, `${month}-01`, context.today));
    const top = categories(context).slice(0, 3);
    if (top.length === 0) return { reply: `No confirmed spending in ${monthName} yet.` };
    return {
      reply: `${monthName} so far: ${formatRupiah(spending)}. Most went to ${top
        .map(([name, amount]) => `${name} ${formatRupiah(amount)}`)
        .join(", ")}.`,
    };
  }

  return {
    reply:
      "Try logging a cash payment (“kopi 25rb”) or asking about your spending, budgets, bills or what you can afford.",
  };
}

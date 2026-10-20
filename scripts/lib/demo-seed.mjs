// Pure rules for the shared reviewer account's records: date arithmetic, scrubbing third-party
// details out of copied transactions, and a deterministic synthetic history. No network and no
// credentials here; scripts/seed-demo-account.mjs does the reading and writing.

export const DEMO_EMAIL = "demo@monara.app";

/** Merchants that may be copied as they are; names of private individuals never are. */
const personSlugs = new Set(["person", "person-income"]);

/** Stand-ins for the private individuals in copied Person transactions. */
const fakePeople = [
  "Rina Pratama",
  "Budi Santoso",
  "Maya Kusuma",
  "Dimas Wijaya",
  "Sari Lestari",
  "Andi Nugroho",
  "Putri Maharani",
  "Fajar Hidayat",
];

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Today's calendar date in Jakarta, the zone the product calendar uses. */
export function jakartaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

/** Small seeded generator, so a reseed on the same day produces the same history. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A large payment to a private individual is likely rent, tuition or a loan, which says too much
 * about a third party and skews a demo's totals. Keep the payment but bring it to a size an
 * everyday transfer would have, with some variety so the amounts do not all look alike.
 */
export function capPersonAmount(amount) {
  const value = Number(amount);
  const limit = 750_000;
  if (!(value > limit)) return amount;
  return 400_000 + (Math.round(value / 1_000) % 35) * 10_000;
}

/**
 * Copies one real transaction for the reviewer account. Keeps merchant, amount, category and
 * time; replaces private individuals' names, drops free text that may name them, and drops
 * everything Gmail-specific (message ids, extraction evidence, confidence scores).
 */
export function scrubTransaction(row, categorySlug, personName) {
  const person = personSlugs.has(categorySlug);
  const merchant = person ? personName : (row.merchant_name ?? "").trim();
  return {
    transaction_type: row.transaction_type,
    merchant_name: merchant || null,
    amount: person ? capPersonAmount(row.amount) : row.amount,
    occurred_on: row.occurred_on,
    occurred_time: row.occurred_time ?? null,
    description: person ? "Transfer" : (row.description ?? null),
    location: person ? null : (row.location ?? null),
    review_status: row.review_status,
    categorySlug,
    accountKey: row.accountKey,
  };
}

/** A stable stand-in per real name, so repeated payments to one person stay one person. */
export function personNamer() {
  const seen = new Map();
  return (name) => {
    const key = (name ?? "").trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, fakePeople[seen.size % fakePeople.length]);
    return seen.get(key);
  };
}

/** A copied row that has neither a merchant nor free text cannot be a manual record. */
export function withFallbackDescription(row) {
  if (row.merchant_name || row.description) return row;
  return {
    ...row,
    description: row.transaction_type === "income" ? "Incoming payment" : "Card payment",
  };
}

// ---------------------------------------------------------------------------------------------
// Synthetic history

// Real data runs at about two transactions a day; the per-week rates below are scaled to match.
const density = 1.7;

const expenseTemplates = [
  // [merchant, category, account, perWeek, min, max, step]
  ["Starbucks", "resto-cafe", "Jago_App", 0.7, 45_000, 110_000, 1_000],
  ["Kopi Kenangan", "resto-cafe", "Jago_App", 0.8, 18_000, 32_000, 1_000],
  ["McDonald's", "resto-cafe", "Jago_App", 0.4, 45_000, 95_000, 500],
  ["KFC", "resto-cafe", "Jago_App", 0.3, 40_000, 90_000, 500],
  ["Shihlin", "resto-cafe", "BCA_MyBCA", 0.4, 45_000, 80_000, 1_000],
  ["Chikuro", "resto-cafe", "BCA_MyBCA", 0.2, 70_000, 140_000, 1_000],
  ["GoFood", "resto-cafe", "Jago_App", 0.5, 35_000, 95_000, 500],
  ["Indomaret", "groceries", "Superbank_App", 0.6, 15_000, 90_000, 500],
  ["Alfamart", "groceries", "Superbank_App", 0.4, 15_000, 85_000, 500],
  ["Circle K", "groceries", "Jago_App", 0.3, 12_000, 60_000, 500],
  ["Superindo", "groceries", "BCA_MyBCA", 0.35, 150_000, 450_000, 100],
  ["Grab", "ride-hail", "Jago_App", 1.1, 18_000, 70_000, 500],
  ["Gojek", "ride-hail", "Jago_App", 0.8, 15_000, 60_000, 500],
  ["Pertamina", "own-vehicle", "BCA_MyBCA", 0.3, 100_000, 200_000, 1_000],
  ["Shell", "own-vehicle", "BCA_MyBCA", 0.2, 150_000, 250_000, 1_000],
  ["Shopee", "ecommerce", "Superbank_App", 0.3, 40_000, 350_000, 100],
  ["Tokopedia", "ecommerce", "Superbank_App", 0.2, 50_000, 300_000, 100],
  ["Lazada", "ecommerce", "Superbank_App", 0.15, 60_000, 400_000, 100],
  ["Uniqlo", "retail", "BCA_MyBCA", 0.1, 199_000, 599_000, 1_000],
  ["Guardian", "retail", "BCA_MyBCA", 0.15, 60_000, 250_000, 500],
  ["XXI", "activities", "Jago_App", 0.2, 50_000, 120_000, 5_000],
  ["CGV", "activities", "Jago_App", 0.1, 50_000, 120_000, 5_000],
  ["Halodoc", "clinic-meds", "BCA_MyBCA", 0.1, 50_000, 180_000, 500],
  ["Kimia Farma", "clinic-meds", "BCA_MyBCA", 0.1, 25_000, 120_000, 500],
];

// [merchant, category, type, account, dayOfMonth, amount]
const monthlyTemplates = [
  ["Telkomsel", "bills", "expense", "BCA_MyBCA", 5, 60_000],
  ["Smartfren", "bills", "expense", "BCA_MyBCA", 8, 75_000],
  ["PLN", "bills", "expense", "BCA_MyBCA", 15, 129_075],
  ["Spotify", "digital", "expense", "Jago_App", 12, 54_990],
  ["Netflix", "digital", "expense", "Jago_App", 20, 186_000],
  ["ChatGPT Plus", "digital", "expense", "Jago_App", 22, 330_000],
  ["Cool Barbershop", "services", "expense", "Jago_App", 14, 50_000],
  ["Celebrate Fitness", "fit-wellness", "expense", "BCA_MyBCA", 3, 450_000],
];

// Moves between the account holder's own accounts, which never count as spending.
const ownName = "Daffa Abhipraya Putra";
const exclusionTemplates = [
  [ownName, "internal", "BCA_MyBCA", 2, 2_000_000, "Transfer to Jago"],
  ["Stockbit Sekuritas", "investment", "BCA_MyBCA", 28, 1_000_000, "Stock purchase"],
];

const incomeTemplates = [
  ["PT Teknologi Maju", "salary", "BCA_MyBCA", 1, 18_500_000, "Monthly salary"],
];

function timeFor(random, lateBias) {
  const hour = lateBias ? 17 + Math.floor(random() * 5) : 7 + Math.floor(random() * 14);
  const minute = Math.floor(random() * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function amountWithin(random, min, max, step) {
  const raw = min + random() * (max - min);
  return Math.max(min, Math.round(raw / step) * step);
}

function* eachDay(start, end) {
  for (let day = start; day <= end; day = addDays(day, 1)) yield day;
}

function monthlyOccurrences(start, end, dayOfMonth) {
  const dates = [];
  for (const day of eachDay(start, end)) {
    if (Number(day.slice(8, 10)) === dayOfMonth) dates.push(day);
  }
  return dates;
}

/**
 * Everyday spending and fixed monthly payments for [start, end], inclusive. When `incomeOnly`
 * is set it returns only salary and the other incoming and own-account moves, for the stretch
 * where real copied transactions already cover the spending.
 */
export function buildSynthetic({ start, end, seed, incomeOnly = false, people = fakePeople }) {
  if (start > end) return [];
  const random = mulberry32(seed);
  const rows = [];
  const row = (fields) => ({
    review_status: "confirmed",
    description: null,
    location: null,
    ...fields,
  });

  for (const [merchant, categorySlug, accountKey, day, amount, description] of incomeTemplates) {
    for (const date of monthlyOccurrences(start, end, day)) {
      rows.push(
        row({
          transaction_type: "income",
          merchant_name: merchant,
          amount,
          occurred_on: date,
          occurred_time: "09:00:00",
          description,
          categorySlug,
          accountKey,
        }),
      );
    }
  }
  for (const [merchant, categorySlug, accountKey, day, amount, description] of exclusionTemplates) {
    for (const date of monthlyOccurrences(start, end, day)) {
      rows.push(
        row({
          transaction_type: "exclusion",
          merchant_name: merchant,
          amount,
          occurred_on: date,
          occurred_time: "10:15:00",
          description,
          categorySlug,
          accountKey,
        }),
      );
    }
  }
  if (incomeOnly) return rows.sort(byDate);

  for (const [merchant, categorySlug, type, accountKey, day, amount] of monthlyTemplates) {
    for (const date of monthlyOccurrences(start, end, day)) {
      rows.push(
        row({
          transaction_type: type,
          merchant_name: merchant,
          amount,
          occurred_on: date,
          occurred_time: timeFor(random, false),
          categorySlug,
          accountKey,
        }),
      );
    }
  }
  for (const date of eachDay(start, end)) {
    // Weekends see a little more eating out and fewer commutes.
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    for (const [merchant, categorySlug, accountKey, perWeek, min, max, step] of expenseTemplates) {
      const adjust =
        categorySlug === "resto-cafe"
          ? weekend
            ? 1.4
            : 0.9
          : categorySlug === "ride-hail"
            ? weekend
              ? 0.6
              : 1.15
            : 1;
      if (random() >= ((perWeek * density) / 7) * adjust) continue;
      rows.push(
        row({
          transaction_type: "expense",
          merchant_name: merchant,
          amount: amountWithin(random, min, max, step),
          occurred_on: date,
          occurred_time: timeFor(random, categorySlug === "resto-cafe"),
          categorySlug,
          accountKey,
        }),
      );
    }
    if (random() < 0.3 / 7) {
      rows.push(
        row({
          transaction_type: "expense",
          merchant_name: people[Math.floor(random() * people.length)],
          amount: amountWithin(random, 50_000, 400_000, 5_000),
          occurred_on: date,
          occurred_time: timeFor(random, true),
          description: "Transfer",
          categorySlug: "person",
          accountKey: "Jago_App",
        }),
      );
    }
  }
  return rows.sort(byDate);
}

function byDate(a, b) {
  return a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Budgets, goals and bills

/** The first day of the month `months` before today's month. */
export function monthsBackStart(today, months) {
  const total = Number(today.slice(0, 4)) * 12 + (Number(today.slice(5, 7)) - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function buildBudgets(today) {
  // Started a few months back, so the Budgets screen has history to show.
  const startsOn = monthsBackStart(today, 3);
  return [
    ["Eating out", "resto-cafe", 2_500_000],
    ["Groceries", "groceries", 1_500_000],
    ["Getting around", "ride-hail", 700_000],
    ["Online shopping", "ecommerce", 900_000],
    ["Subscriptions", "digital", 650_000],
  ].map(([name, categorySlug, limit]) => ({
    name,
    categorySlug,
    cadence: "monthly",
    limit_amount: limit,
    warning_percent: 80,
    starts_on: startsOn,
  }));
}

export function buildGoals(today) {
  return [
    {
      name: "Japan trip",
      target_amount: 25_000_000,
      saved_amount: 9_500_000,
      target_date: addDays(today, 240),
    },
    {
      name: "Emergency fund",
      target_amount: 30_000_000,
      saved_amount: 12_000_000,
      target_date: addDays(today, 365),
    },
  ];
}

export function buildBills(today) {
  const nextDue = (day) => {
    const thisMonth = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    if (thisMonth > today) return thisMonth;
    const next = addDays(`${today.slice(0, 7)}-28`, 5);
    return `${next.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  };
  return monthlyTemplates
    .filter(([merchant]) =>
      ["PLN", "Telkomsel", "Smartfren", "Spotify", "Netflix"].includes(merchant),
    )
    .map(([merchant, , , accountKey, day, amount]) => ({
      merchant_name: merchant,
      accountKey,
      expected_amount: amount,
      interval_count: 1,
      interval_unit: "month",
      next_due_on: nextDue(day),
    }));
}

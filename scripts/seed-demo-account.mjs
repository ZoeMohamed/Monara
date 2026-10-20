// Creates or refreshes the shared reviewer account (demo@monara.app) and fills it with records:
// a scrubbed copy of one real account's transactions plus about three months of realistic
// synthetic history. Safe to re-run: it only ever replaces the reviewer account's own records,
// and it shifts dates so the data ends today.
//
// Usage (credentials come from the environment and are never printed):
//   SEED_SUPABASE_URL=… SEED_SERVICE_ROLE_KEY=… SEED_SOURCE_USER_ID=… \
//   SEED_DEMO_PASSWORD=… node scripts/seed-demo-account.mjs [--dry-run] [--reset-password]
//
// SEED_SOURCE_USER_ID is optional; without it the history is synthetic only.
// SEED_DEMO_PASSWORD is required when the account does not exist yet or with --reset-password.
import {
  addDays,
  buildBills,
  buildBudgets,
  buildGoals,
  buildSynthetic,
  DEMO_EMAIL,
  daysBetween,
  jakartaToday,
  personNamer,
  scrubTransaction,
  withFallbackDescription,
} from "./lib/demo-seed.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const resetPassword = args.has("--reset-password");
const { SEED_SUPABASE_URL, SEED_SERVICE_ROLE_KEY, SEED_SOURCE_USER_ID, SEED_DEMO_PASSWORD } =
  process.env;

function fail(message) {
  console.error(`seed-demo-account: ${message}`);
  process.exit(1);
}

if (!SEED_SUPABASE_URL || !SEED_SERVICE_ROLE_KEY) {
  fail("SEED_SUPABASE_URL and SEED_SERVICE_ROLE_KEY are required.");
}
const base = SEED_SUPABASE_URL.replace(/\/$/, "");
const headers = {
  apikey: SEED_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SEED_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" ? (body.message ?? body.msg ?? body.error) : body;
    throw new Error(
      `${init.method ?? "GET"} ${path.split("?")[0]} failed (${response.status}): ${detail}`,
    );
  }
  return body;
}

const rest = (path, init) => call(`/rest/v1/${path}`, init);

async function insert(table, rows) {
  for (let from = 0; from < rows.length; from += 100) {
    await rest(table, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows.slice(from, from + 100)),
    });
  }
}

async function findDemoUser() {
  for (let page = 1; page <= 20; page += 1) {
    const { users } = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const found = users.find((user) => user.email?.toLowerCase() === DEMO_EMAIL);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

const appMetadata = { provider: "email", providers: ["email"], monara_demo_account: true };

async function ensureDemoUser() {
  const existing = await findDemoUser();
  if (!existing) {
    if (!SEED_DEMO_PASSWORD) fail("SEED_DEMO_PASSWORD is required to create the account.");
    if (dryRun) return { id: null, created: true };
    const user = await call("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: SEED_DEMO_PASSWORD,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: { full_name: "Monara Demo" },
      }),
    });
    return { id: user.id, created: true };
  }
  if (resetPassword && !SEED_DEMO_PASSWORD) fail("--reset-password needs SEED_DEMO_PASSWORD.");
  if (!dryRun) {
    await call(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({
        app_metadata: { ...existing.app_metadata, ...appMetadata },
        user_metadata: { ...existing.user_metadata, full_name: "Monara Demo" },
        email_confirm: true,
        ...(resetPassword ? { password: SEED_DEMO_PASSWORD } : {}),
      }),
    });
  }
  return { id: existing.id, created: false };
}

async function readSource(userId) {
  const query = (table, select, extra = "") =>
    rest(`${table}?user_id=eq.${userId}&select=${select}${extra}&limit=5000`);
  const [accounts, categories, transactions, profile] = await Promise.all([
    query("financial_accounts", "id,name,institution,institution_key,account_type,currency"),
    query("categories", "id,slug"),
    query("transactions", "*", "&deleted_at=is.null"),
    rest(`profiles?id=eq.${userId}&select=full_name`),
  ]);
  return { accounts, categories, transactions, fullName: profile[0]?.full_name ?? null };
}

const today = jakartaToday();
const demo = await ensureDemoUser();
if (demo.id && demo.id === SEED_SOURCE_USER_ID)
  fail("The reviewer account cannot be its own source.");

let source = null;
if (SEED_SOURCE_USER_ID) source = await readSource(SEED_SOURCE_USER_ID);
else console.log("No SEED_SOURCE_USER_ID: seeding synthetic history only.");

// The financial accounts the synthetic history spends from. A source account's own copy wins.
const defaultAccounts = new Map([
  [
    "BCA_MyBCA",
    {
      name: "MyBCA",
      institution: "BCA",
      institution_key: "BCA_MyBCA",
      account_type: "bank",
      currency: "IDR",
    },
  ],
  [
    "Jago_App",
    {
      name: "Jago",
      institution: "Jago",
      institution_key: "Jago_App",
      account_type: "bank",
      currency: "IDR",
    },
  ],
  [
    "Superbank_App",
    {
      name: "Superbank",
      institution: "Superbank",
      institution_key: "Superbank_App",
      account_type: "bank",
      currency: "IDR",
    },
  ],
]);
const requiredAccounts = [...defaultAccounts.keys()];
const sourceAccounts = new Map((source?.accounts ?? []).map((a) => [a.institution_key, a]));

// Copied rows keep their relative dates, shifted so the newest ends today.
const copied = [];
if (source) {
  const slugById = new Map(source.categories.map((c) => [c.id, c.slug]));
  const accountKeyById = new Map(source.accounts.map((a) => [a.id, a.institution_key]));
  // Rows with an unknown date or amount are still waiting on review in the source; a demo
  // ledger has no use for half-known records.
  const dated = source.transactions.filter((t) => t.occurred_on && Number(t.amount) > 0);
  const newest = dated.reduce(
    (max, t) => (t.occurred_on > max ? t.occurred_on : max),
    "0000-00-00",
  );
  const shift = Math.max(0, daysBetween(newest, today));
  const personName = personNamer();
  for (const row of dated) {
    const slug = slugById.get(row.category_id) ?? null;
    const accountKey = accountKeyById.get(row.financial_account_id);
    if (!accountKey || !slug) continue;
    const scrubbed = scrubTransaction(
      { ...row, accountKey },
      slug,
      slug.startsWith("person") ? personName(row.merchant_name) : null,
    );
    copied.push(
      withFallbackDescription({ ...scrubbed, occurred_on: addDays(row.occurred_on, shift) }),
    );
  }
}
const realStart = copied.reduce((min, t) => (t.occurred_on < min ? t.occurred_on : min), today);
const synthetic = [
  ...buildSynthetic({ start: addDays(today, -91), end: addDays(realStart, -1), seed: 20261020 }),
  ...(copied.length > 0
    ? buildSynthetic({ start: realStart, end: today, seed: 20261021, incomeOnly: true })
    : buildSynthetic({ start: realStart, end: today, seed: 20261021 })),
];
const rows = [...copied, ...synthetic].filter((row) => row.occurred_on <= today);

console.log(
  `Plan for ${new URL(base).host}: ${copied.length} copied + ${synthetic.length} synthetic transactions, ` +
    `${buildBudgets(today).length} budgets, ${buildGoals(today).length} goals, ${buildBills(today).length} bills.`,
);
if (dryRun) {
  console.log("Dry run: nothing was written.");
  process.exit(0);
}

const userId = demo.id;
const verified = await call(`/auth/v1/admin/users/${userId}`);
if (
  verified.email?.toLowerCase() !== DEMO_EMAIL ||
  verified.app_metadata?.monara_demo_account !== true
) {
  fail("Refusing to wipe an account that is not the flagged reviewer account.");
}

// Replace only this account's records. Children go first because the foreign keys restrict.
for (const table of [
  "transactions",
  "reminders",
  "recurring_bills",
  "budgets",
  "financial_goals",
  "forecast_runs",
  "chat_conversations",
  "financial_accounts",
]) {
  await rest(`${table}?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

const categories = await rest(`categories?user_id=eq.${userId}&select=id,slug&limit=500`);
const categoryId = new Map(categories.map((c) => [c.slug, c.id]));
const missing = [...new Set(rows.map((r) => r.categorySlug))].filter(
  (slug) => !categoryId.has(slug),
);
if (missing.length > 0) fail(`The reviewer account has no category for: ${missing.join(", ")}.`);

await insert(
  "financial_accounts",
  requiredAccounts.map((key, index) => {
    const account = sourceAccounts.get(key) ?? defaultAccounts.get(key);
    return {
      user_id: userId,
      client_request_id: `demo-seed-account-${index}`,
      name: account.name,
      institution: account.institution,
      institution_key: account.institution_key,
      account_type: account.account_type,
      currency: account.currency ?? "IDR",
      last_four: null,
      is_active: true,
    };
  }),
);
const accountId = new Map(
  (await rest(`financial_accounts?user_id=eq.${userId}&select=id,institution_key`)).map((a) => [
    a.institution_key,
    a.id,
  ]),
);

await insert(
  "transactions",
  rows.map((row, index) => ({
    user_id: userId,
    client_request_id: `demo-seed-${index}`,
    source_type: "manual_form",
    financial_account_id: accountId.get(row.accountKey),
    category_id: categoryId.get(row.categorySlug),
    transaction_type: row.transaction_type,
    merchant_name: row.merchant_name,
    amount: Number(row.amount),
    currency: "IDR",
    occurred_on: row.occurred_on,
    occurred_time: row.occurred_time,
    description: row.description,
    location: row.location,
    review_status: row.review_status,
  })),
);
await insert(
  "budgets",
  buildBudgets(today).map(({ categorySlug, ...budget }, index) => ({
    ...budget,
    user_id: userId,
    client_request_id: `demo-seed-budget-${index}`,
    category_id: categoryId.get(categorySlug),
    currency: "IDR",
  })),
);
await insert(
  "financial_goals",
  buildGoals(today).map((goal, index) => ({
    ...goal,
    user_id: userId,
    client_request_id: `demo-seed-goal-${index}`,
    currency: "IDR",
  })),
);
await insert(
  "recurring_bills",
  buildBills(today).map(({ accountKey, ...bill }, index) => ({
    ...bill,
    user_id: userId,
    client_request_id: `demo-seed-bill-${index}`,
    financial_account_id: accountId.get(accountKey),
    currency: "IDR",
    status: "active",
  })),
);
await rest(`profiles?id=eq.${userId}`, {
  method: "PATCH",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    display_name: "Monara Demo",
    // Transfers between the account holder's own accounts are recognised by this name.
    full_name: source?.fullName ?? "Daffa Abhipraya Putra",
  }),
});

console.log(
  `${demo.created ? "Created" : "Refreshed"} ${DEMO_EMAIL}: ${rows.length} transactions seeded through ${today}.`,
);

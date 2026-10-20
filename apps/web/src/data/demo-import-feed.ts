import type { ImportedTransaction } from "@/components/use-onboarding-engine";

type Bank = Pick<ImportedTransaction, "provider" | "bankName">;

const bca: Bank = { provider: "BCA", bankName: "MyBCA" };
const mandiri: Bank = { provider: "Mandiri", bankName: "Livin'" };
const jago: Bank = { provider: "Jago", bankName: "Jago" };

// Sample transactions for the setup demo, newest first as Gmail lists them. Exclusions are
// moves between the guest's own accounts, which the full name step exists to catch.
const rows: [Bank, string, number, string, ImportedTransaction["kind"], string | null][] = [
  [bca, "Starbucks", 58_000, "2026-10-11", "expense", "Food & drinks"],
  [mandiri, "Transfer to Daffa Abhipraya", 2_000_000, "2026-10-10", "exclusion", "Internal"],
  [bca, "Grab ride", 46_500, "2026-10-10", "expense", "Transport"],
  [jago, "Circle K", 34_200, "2026-10-09", "expense", "Groceries"],
  [bca, "Salary PT Teknologi Maju", 8_500_000, "2026-10-08", "income", "Salary"],
  [mandiri, "ChatGPT Plus", 330_000, "2026-10-08", "expense", "Digital"],
  [bca, "GrabFood · KFC", 38_000, "2026-10-07", "expense", "Food & drinks"],
  [jago, "Top up from BCA", 500_000, "2026-10-07", "exclusion", "Internal"],
  [bca, "Spotify Premium", 54_990, "2026-10-06", "expense", "Digital"],
  [mandiri, "Lazada", 215_000, "2026-10-05", "expense", null],
  [bca, "Shell", 150_000, "2026-10-05", "expense", "Transport"],
  [jago, "Transfer from Rina Putri", 350_000, "2026-10-04", "income", null],
  [bca, "Starbucks", 67_000, "2026-10-04", "expense", "Food & drinks"],
  [mandiri, "Netflix", 186_000, "2026-10-03", "expense", "Digital"],
  [bca, "Transfer to Mandiri", 1_500_000, "2026-10-03", "exclusion", "Internal"],
  [jago, "Circle K", 22_800, "2026-10-02", "expense", "Groceries"],
  [bca, "Grab airport ride", 185_000, "2026-10-02", "expense", "Transport"],
  [mandiri, "Shopee", 129_000, "2026-10-01", "expense", null],
  [bca, "Electricity token", 200_000, "2026-09-30", "expense", "Bills"],
  [jago, "Cashback ShopeePay", 12_500, "2026-09-29", "income", "Cashback"],
  [bca, "McDonald's", 59_500, "2026-09-29", "expense", "Food & drinks"],
  [mandiri, "Transfer to Jago", 750_000, "2026-09-28", "exclusion", "Internal"],
  [bca, "Grab ride", 31_000, "2026-09-27", "expense", "Transport"],
  [bca, "Carrefour", 412_300, "2026-09-26", "expense", "Groceries"],
  [jago, "KFC", 48_000, "2026-09-25", "expense", "Food & drinks"],
  [mandiri, "Refund Lazada", 189_000, "2026-09-23", "income", "Refund"],
  [bca, "Circle K", 18_500, "2026-09-22", "expense", "Groceries"],
  [bca, "Transfer to Daffa Abhipraya", 3_000_000, "2026-09-20", "exclusion", "Internal"],
  [mandiri, "Starbucks", 55_000, "2026-09-18", "expense", "Food & drinks"],
  [jago, "GrabFood · Burger King", 42_000, "2026-09-16", "expense", "Food & drinks"],
  [bca, "Claude Pro", 330_000, "2026-09-14", "expense", "Digital"],
];

export const demoImportFeed: ImportedTransaction[] = rows.map(
  ([bank, merchant, amount, date, kind, category], index) => ({
    id: `demo-${index}`,
    ...bank,
    merchant,
    amount,
    date,
    kind,
    category,
    needsReview: category === null,
  }),
);

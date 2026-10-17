import type { ImportedTransaction } from "@/components/use-onboarding-engine";

type Bank = Pick<ImportedTransaction, "provider" | "bankName">;

const bca: Bank = { provider: "BCA", bankName: "MyBCA" };
const mandiri: Bank = { provider: "Mandiri", bankName: "Livin'" };
const jago: Bank = { provider: "Jago", bankName: "Jago" };

// Sample transactions for the setup demo, newest first as Gmail lists them. Exclusions are
// moves between the guest's own accounts, which the full name step exists to catch.
const rows: [Bank, string, number, string, ImportedTransaction["kind"]][] = [
  [bca, "Kopi Kenangan", 28_000, "2026-10-11", "expense"],
  [mandiri, "Transfer to Daffa Abhipraya", 2_000_000, "2026-10-10", "exclusion"],
  [bca, "Grab ride", 46_500, "2026-10-10", "expense"],
  [jago, "Indomaret", 34_200, "2026-10-09", "expense"],
  [bca, "Salary PT Teknologi Maju", 8_500_000, "2026-10-08", "income"],
  [mandiri, "Telkomsel data plan", 99_000, "2026-10-08", "expense"],
  [bca, "GoFood Ayam Geprek", 38_000, "2026-10-07", "expense"],
  [jago, "Top up from BCA", 500_000, "2026-10-07", "exclusion"],
  [bca, "Spotify Premium", 54_990, "2026-10-06", "expense"],
  [mandiri, "Tokopedia", 215_000, "2026-10-05", "expense"],
  [bca, "Pertamina Pertalite", 150_000, "2026-10-05", "expense"],
  [jago, "Transfer from Rina Putri", 350_000, "2026-10-04", "income"],
  [bca, "Starbucks", 67_000, "2026-10-04", "expense"],
  [mandiri, "Netflix", 186_000, "2026-10-03", "expense"],
  [bca, "Transfer to Mandiri", 1_500_000, "2026-10-03", "exclusion"],
  [jago, "Alfamart", 22_800, "2026-10-02", "expense"],
  [bca, "KAI Access", 285_000, "2026-10-02", "expense"],
  [mandiri, "Shopee", 129_000, "2026-10-01", "expense"],
  [bca, "PLN prepaid token", 200_000, "2026-09-30", "expense"],
  [jago, "Cashback ShopeePay", 12_500, "2026-09-29", "income"],
  [bca, "McDonald's", 59_500, "2026-09-29", "expense"],
  [mandiri, "Transfer to Jago", 750_000, "2026-09-28", "exclusion"],
  [bca, "Gojek ride", 31_000, "2026-09-27", "expense"],
  [bca, "Transmart", 412_300, "2026-09-26", "expense"],
  [jago, "Richeese Factory", 48_000, "2026-09-25", "expense"],
  [mandiri, "Refund Tokopedia", 189_000, "2026-09-23", "income"],
  [bca, "Indomaret", 18_500, "2026-09-22", "expense"],
  [bca, "Transfer to Daffa Abhipraya", 3_000_000, "2026-09-20", "exclusion"],
  [mandiri, "Kopi Kenangan", 26_000, "2026-09-18", "expense"],
  [jago, "GoFood Nasi Padang", 42_000, "2026-09-16", "expense"],
  [bca, "Janji Jiwa", 24_000, "2026-09-14", "expense"],
];

export const demoImportFeed: ImportedTransaction[] = rows.map(
  ([bank, merchant, amount, date, kind], index) => ({
    id: `demo-${index}`,
    ...bank,
    merchant,
    amount,
    date,
    kind,
  }),
);

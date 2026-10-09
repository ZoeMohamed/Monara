import type { IconName } from "@/components/icon";

export type Transaction = {
  id: number;
  merchant: string;
  category: string;
  amount: number;
  date: string;
  isoDate: string;
  time: string;
  method: string;
  source: string;
  sourceDetail: string;
  icon: IconName;
  emoji: string;
  confidence: number;
  reviewed: boolean;
};

export type BudgetCategory = {
  id: string;
  name: string;
  amount: number;
  budget: number;
  color: string;
  tint: string;
  icon: IconName;
  emoji: string;
};

export const initialTransactions: Transaction[] = [
  { id: 1, merchant: "PLN", category: "Tagihan", amount: 53_500, date: "9 Okt 2026", isoDate: "2026-10-09", time: "09.42", method: "Bank Demo", source: "Email transaksi demo", sourceDetail: "Terdeteksi dari notifikasi pembayaran contoh.", icon: "budget", emoji: "⚡", confidence: 98, reviewed: false },
  { id: 2, merchant: "Kopi Sudut", category: "Makan & Minum", amount: 46_200, date: "9 Okt 2026", isoDate: "2026-10-09", time: "08.15", method: "Bank Demo", source: "Email transaksi demo", sourceDetail: "Nama merchant dan kategori adalah data contoh.", icon: "food", emoji: "🍽️", confidence: 94, reviewed: false },
  { id: 3, merchant: "Toko Harian", category: "Belanja", amount: 73_800, date: "9 Okt 2026", isoDate: "2026-10-09", time: "07.52", method: "Bank Demo", source: "Email transaksi demo", sourceDetail: "Prototype tidak terhubung dengan akun bank.", icon: "shopping", emoji: "🛍️", confidence: 97, reviewed: false },
  { id: 4, merchant: "Transport Online", category: "Transportasi", amount: 39_000, date: "8 Okt 2026", isoDate: "2026-10-08", time: "21.20", method: "Dompet Demo", source: "Notifikasi transaksi demo", sourceDetail: "Data dibuat untuk pengujian antarmuka.", icon: "car", emoji: "🚕", confidence: 99, reviewed: true },
  { id: 5, merchant: "Streaming Plus", category: "Entertainment", amount: 59_000, date: "8 Okt 2026", isoDate: "2026-10-08", time: "18.04", method: "Bank Demo", source: "Email transaksi demo", sourceDetail: "Pembayaran berulang contoh.", icon: "phone", emoji: "🙂", confidence: 96, reviewed: true },
  { id: 6, merchant: "Apotek Sehat", category: "Perawatan", amount: 86_500, date: "8 Okt 2026", isoDate: "2026-10-08", time: "15.13", method: "Bank Demo", source: "Email transaksi demo", sourceDetail: "Kategori diprediksi dari data contoh.", icon: "health", emoji: "✚", confidence: 91, reviewed: true },
  { id: 7, merchant: "Mini Market", category: "Rumah", amount: 64_000, date: "8 Okt 2026", isoDate: "2026-10-08", time: "11.08", method: "Dompet Demo", source: "Notifikasi transaksi demo", sourceDetail: "Data dibuat untuk pengujian antarmuka.", icon: "shopping", emoji: "🏠", confidence: 96, reviewed: true },
  { id: 8, merchant: "Laundry Kita", category: "Lainnya", amount: 37_500, date: "8 Okt 2026", isoDate: "2026-10-08", time: "09.22", method: "Tunai", source: "Manual", sourceDetail: "Ditambahkan manual pada prototype.", icon: "more", emoji: "?", confidence: 100, reviewed: true },
];

export const initialCategories: BudgetCategory[] = [
  { id: "entertainment", name: "Entertainment", amount: 1_865_000, budget: 2_800_000, color: "#91c59c", tint: "#1e2b22", icon: "phone", emoji: "🙂" },
  { id: "others", name: "Lainnya", amount: 995_000, budget: 2_000_000, color: "#91c59c", tint: "#1e2b22", icon: "more", emoji: "?" },
  { id: "food", name: "Makan & Minum", amount: 789_000, budget: 1_600_000, color: "#91c59c", tint: "#1e2b22", icon: "food", emoji: "🍽️" },
  { id: "home", name: "Rumah", amount: 620_000, budget: 1_500_000, color: "#91c59c", tint: "#1e2b22", icon: "home", emoji: "🏠" },
  { id: "shopping", name: "Belanja", amount: 466_200, budget: 1_200_000, color: "#91c59c", tint: "#1e2b22", icon: "shopping", emoji: "🛍️" },
];

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function compactRupiah(value: number) {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1_000) return `Rp ${Math.round(value / 1_000).toLocaleString("id-ID")}rb`;
  return formatRupiah(value).replace("Rp", "Rp ");
}

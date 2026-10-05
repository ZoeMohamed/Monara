export type Transaction = {
  id: number;
  merchant: string;
  category: string;
  amount: number;
  date: string;
  time: string;
  method: string;
  emoji: string;
  confidence: number;
  reviewed: boolean;
};

export const initialTransactions: Transaction[] = [
  {
    id: 1,
    merchant: "Grab · GrabCar",
    category: "Transportasi",
    amount: 67000,
    date: "Hari ini",
    time: "09.42",
    method: "GoPay",
    emoji: "🚕",
    confidence: 98,
    reviewed: true,
  },
  {
    id: 2,
    merchant: "Kopi Kenangan",
    category: "Makan & Minum",
    amount: 28000,
    date: "Hari ini",
    time: "08.15",
    method: "BCA",
    emoji: "☕",
    confidence: 94,
    reviewed: false,
  },
  {
    id: 3,
    merchant: "Alfamart",
    category: "Belanja",
    amount: 89500,
    date: "Kemarin",
    time: "18.20",
    method: "BCA",
    emoji: "🏪",
    confidence: 97,
    reviewed: true,
  },
  {
    id: 4,
    merchant: "Spotify Premium",
    category: "Digital",
    amount: 54990,
    date: "Kemarin",
    time: "07.02",
    method: "Jago",
    emoji: "🎧",
    confidence: 99,
    reviewed: true,
  },
  {
    id: 5,
    merchant: "Sate Khas Senayan",
    category: "Makan & Minum",
    amount: 156000,
    date: "2 Okt 2026",
    time: "19.34",
    method: "Mandiri",
    emoji: "🍽️",
    confidence: 91,
    reviewed: false,
  },
  {
    id: 6,
    merchant: "Netflix",
    category: "Digital",
    amount: 186000,
    date: "1 Okt 2026",
    time: "06.00",
    method: "Jago",
    emoji: "📺",
    confidence: 99,
    reviewed: true,
  },
];

export const categories = [
  { name: "Makan & Minum", amount: 1180000, budget: 1500000, color: "#1b7a50", emoji: "🍽️" },
  { name: "Transportasi", amount: 620000, budget: 900000, color: "#d39455", emoji: "🚕" },
  { name: "Belanja", amount: 548000, budget: 1000000, color: "#7c79bf", emoji: "🛍️" },
  { name: "Digital", amount: 492500, budget: 700000, color: "#4d8fa5", emoji: "📱" },
];

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

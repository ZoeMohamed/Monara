"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

import { Icon, IconName } from "@/components/icon";
import { InstallAppButton } from "@/components/install-app-button";
import {
  categories,
  formatRupiah,
  initialTransactions,
  Transaction,
} from "@/data/sample-data";

type Tab = "home" | "transactions" | "insights" | "account";

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: "home", label: "Beranda", icon: "home" },
  { id: "transactions", label: "Transaksi", icon: "transactions" },
  { id: "insights", label: "Analisis", icon: "insights" },
  { id: "account", label: "Akun", icon: "account" },
];

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#173b2e] text-sm font-black text-white shadow-[0_8px_20px_#173b2e33]">
        F<span className="sr-only">IN</span>
      </span>
      <span className="text-xl font-black tracking-[-0.05em] text-[#173b2e]">FIN</span>
    </div>
  );
}

function TrendChart({ annual }: { annual: boolean }) {
  return (
    <svg aria-label="Grafik laju pengeluaran" className="h-28 w-full" viewBox="0 0 540 120">
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1b7a50" stopOpacity="0.22" />
          <stop offset="1" stopColor="#1b7a50" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 106H532" stroke="#dce5de" />
      <path
        d={
          annual
            ? "M8 99 C65 90,95 72,145 80 S230 62,277 48 S366 59,412 33 S485 20,532 13 L532 106 L8 106Z"
            : "M8 101 C42 94,58 85,91 87 S146 69,177 66 S225 51,265 54 S322 36,358 40 S417 28,450 25 S501 12,532 16 L532 106 L8 106Z"
        }
        fill="url(#area)"
      />
      <path
        d={
          annual
            ? "M8 99 C65 90,95 72,145 80 S230 62,277 48 S366 59,412 33 S485 20,532 13"
            : "M8 101 C42 94,58 85,91 87 S146 69,177 66 S225 51,265 54 S322 36,358 40 S417 28,450 25 S501 12,532 16"
        }
        fill="none"
        stroke="#1b7a50"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path d="M8 101 532 8" fill="none" stroke="#92a39a" strokeDasharray="7 7" strokeWidth="1.5" />
    </svg>
  );
}

function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: Transaction;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition hover:bg-[#f3f6f2] sm:px-3"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] border border-[#e1e8e2] bg-[#f8faf7] text-lg">
        {transaction.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[#213b31] sm:text-[15px]">
          {transaction.merchant}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#708079]">
          {transaction.category} · {transaction.method}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold text-[#213b31] sm:text-[15px]">
          {formatRupiah(transaction.amount).replace("Rp", "Rp ")}
        </span>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#78877f]">
          {!transaction.reviewed ? <span className="h-1.5 w-1.5 rounded-full bg-[#dd9d57]" /> : null}
          {transaction.time}
        </span>
      </span>
    </button>
  );
}

function HomeView({
  annual,
  setAnnual,
  transactions,
  openTransaction,
}: {
  annual: boolean;
  setAnnual: (value: boolean) => void;
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
}) {
  const amount = annual ? 31840000 : 2840500;
  const budget = annual ? 55200000 : 4600000;
  const percentage = Math.round((amount / budget) * 100);

  return (
    <div className="animate-[rise_.35s_ease-out]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-[#718078]">Selamat pagi, Zoe</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.055em] text-[#173b2e] sm:text-4xl">
            Uangmu hari ini.
          </h1>
        </div>
        <div className="hidden sm:block">
          <InstallAppButton />
        </div>
      </div>

      <section className="mt-7 overflow-hidden rounded-[1.8rem] bg-[#173b2e] p-6 text-white shadow-[0_24px_60px_#173b2e26] sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#bcd0c5]">Pengeluaran</p>
          <div className="flex rounded-full bg-white/10 p-1 text-xs font-bold">
            <button
              className={`rounded-full px-3 py-1.5 transition ${!annual ? "bg-white text-[#173b2e]" : "text-[#c9d8d0]"}`}
              onClick={() => setAnnual(false)}
              type="button"
            >
              30H
            </button>
            <button
              className={`rounded-full px-3 py-1.5 transition ${annual ? "bg-white text-[#173b2e]" : "text-[#c9d8d0]"}`}
              onClick={() => setAnnual(true)}
              type="button"
            >
              12B
            </button>
          </div>
        </div>
        <p className="mt-4 text-[clamp(2.2rem,8vw,4rem)] font-black tracking-[-0.065em]">
          {formatRupiah(amount)}
        </p>
        <div className="mt-3 flex items-center justify-between text-xs text-[#c3d2ca]">
          <span>{percentage}% dari budget</span>
          <span>{formatRupiah(budget - amount)} tersisa</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#83c69e]" style={{ width: `${percentage}%` }} />
        </div>
        <div className="mt-7 -mb-2 rounded-2xl bg-white/[0.06] px-2 pt-4">
          <TrendChart annual={annual} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-[#dfe7e1] bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718078]">Ritme belanja</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#173b2e]">Rp94.700</p>
              <p className="mt-1 text-xs text-[#718078]">rata-rata per hari</p>
            </div>
            <span className="rounded-full bg-[#e2f1e7] px-2.5 py-1 text-xs font-bold text-[#1b7a50]">↓ 12%</span>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[#dfe7e1] bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718078]">Perlu ditinjau</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#173b2e]">
                {transactions.filter((item) => !item.reviewed).length} transaksi
              </p>
              <p className="mt-1 text-xs text-[#718078]">confidence di bawah 95%</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f9ead8] text-sm">✦</span>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-[-0.035em] text-[#173b2e]">Transaksi terbaru</h2>
            <p className="mt-1 text-xs text-[#718078]">Tercatat otomatis dari email transaksi</p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-[#e5ebe6] rounded-[1.5rem] border border-[#dfe7e1] bg-white px-4 py-1 sm:px-5">
          {transactions.slice(0, 4).map((transaction) => (
            <TransactionRow
              key={transaction.id}
              onClick={() => openTransaction(transaction)}
              transaction={transaction}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function TransactionsView({
  transactions,
  openTransaction,
}: {
  transactions: Transaction[];
  openTransaction: (transaction: Transaction) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      transactions.filter((transaction) =>
        `${transaction.merchant} ${transaction.category}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, transactions],
  );

  return (
    <div className="animate-[rise_.35s_ease-out]">
      <p className="text-sm font-semibold text-[#718078]">Semua catatan</p>
      <h1 className="mt-1 text-3xl font-black tracking-[-0.055em] text-[#173b2e] sm:text-4xl">Transaksi</h1>
      <label className="mt-7 flex items-center gap-3 rounded-2xl border border-[#dbe4dd] bg-white px-4 py-3.5 shadow-sm">
        <Icon className="h-5 w-5 text-[#76857d]" name="search" />
        <span className="sr-only">Cari transaksi</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#93a099]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari merchant atau kategori"
          value={query}
        />
      </label>
      <div className="mt-6">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718078]">Oktober 2026</p>
          <p className="text-sm font-bold text-[#173b2e]">{formatRupiah(2840500)}</p>
        </div>
        <div className="mt-3 divide-y divide-[#e5ebe6] rounded-[1.5rem] border border-[#dfe7e1] bg-white px-4 py-1 sm:px-5">
          {visible.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              onClick={() => openTransaction(transaction)}
              transaction={transaction}
            />
          ))}
          {visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#718078]">Tidak ada transaksi yang cocok.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InsightsView() {
  return (
    <div className="animate-[rise_.35s_ease-out]">
      <p className="text-sm font-semibold text-[#718078]">Oktober 2026</p>
      <h1 className="mt-1 text-3xl font-black tracking-[-0.055em] text-[#173b2e] sm:text-4xl">Analisis</h1>
      <section className="mt-7 rounded-[1.75rem] border border-[#dfe7e1] bg-white p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718078]">Insight bulan ini</p>
        <p className="mt-4 max-w-xl text-2xl font-black leading-tight tracking-[-0.04em] text-[#173b2e] sm:text-3xl">
          Kamu menghemat 12% dibanding ritme bulan lalu.
        </p>
        <p className="mt-3 text-sm leading-6 text-[#65756d]">
          Pengeluaran transportasi turun paling besar. Makan & minum masih mendekati batas budget.
        </p>
      </section>
      <section className="mt-6 rounded-[1.75rem] border border-[#dfe7e1] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-black tracking-[-0.03em] text-[#173b2e]">Budget per kategori</h2>
        <div className="mt-5 space-y-6">
          {categories.map((category) => {
            const percentage = Math.round((category.amount / category.budget) * 100);
            return (
              <div key={category.name}>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f2f5f1]">{category.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-[#213b31]">{category.name}</p>
                      <p className="shrink-0 text-xs font-semibold text-[#65756d]">
                        {formatRupiah(category.amount)} / {formatRupiah(category.budget)}
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1ed]">
                      <div
                        className="h-full rounded-full"
                        style={{ backgroundColor: category.color, width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AccountView({ online }: { online: boolean }) {
  return (
    <div className="animate-[rise_.35s_ease-out]">
      <p className="text-sm font-semibold text-[#718078]">Profil & keamanan</p>
      <h1 className="mt-1 text-3xl font-black tracking-[-0.055em] text-[#173b2e] sm:text-4xl">Akun</h1>
      <section className="mt-7 rounded-[1.75rem] bg-[#173b2e] p-6 text-white sm:p-7">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl font-black">ZM</span>
          <div>
            <h2 className="text-lg font-bold">Zoe Mohamed</h2>
            <p className="mt-0.5 text-sm text-[#bfd0c7]">zoe@example.com</p>
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-[1.75rem] border border-[#dfe7e1] bg-white p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1f0e6] text-[#1b7a50]">
            <Icon name="shield" />
          </span>
          <div>
            <h2 className="font-bold text-[#173b2e]">Privacy status</h2>
            <p className="mt-1 text-sm leading-6 text-[#65756d]">
              Gmail belum terhubung. Prototype ini hanya memakai data demo lokal.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {["Read-only OAuth", "Raw email dibuang", "AI tanpa tools"].map((item) => (
            <div className="rounded-2xl bg-[#f2f6f2] px-4 py-3 text-xs font-semibold text-[#365247]" key={item}>
              <span className="mr-2 text-[#1b7a50]">✓</span>{item}
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6 rounded-[1.75rem] border border-[#dfe7e1] bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-[#173b2e]">Status aplikasi</h2>
            <p className="mt-1 text-sm text-[#65756d]">{online ? "Online dan siap dipakai" : "Offline · app shell tetap tersedia"}</p>
          </div>
          <span className={`h-3 w-3 rounded-full ${online ? "bg-[#2d9b68]" : "bg-[#d29a58]"}`} />
        </div>
        <div className="mt-5 sm:hidden">
          <InstallAppButton />
        </div>
      </section>
    </div>
  );
}

export function FinApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [annual, setAnnual] = useState(false);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const online = useOnlineStatus();

  const review = (id: number) => {
    setTransactions((items) => items.map((item) => (item.id === id ? { ...item, reviewed: true } : item)));
    setSelected(null);
  };

  const addTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const merchant = String(data.get("merchant") || "Transaksi baru");
    setTransactions((items) => [
      {
        id: Date.now(),
        merchant,
        category: "Lainnya",
        amount: Number.isFinite(amount) ? amount : 0,
        date: "Hari ini",
        time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
        method: "Manual",
        emoji: "✦",
        confidence: 100,
        reviewed: true,
      },
      ...items,
    ]);
    setAddOpen(false);
    setActiveTab("transactions");
  };

  return (
    <div className="min-h-dvh bg-[#edf2ec] text-[#213b31] lg:p-4">
      <div className="mx-auto min-h-dvh max-w-[1500px] overflow-hidden bg-[#f8faf7] lg:grid lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-[248px_minmax(0,1fr)] lg:rounded-[2rem] lg:border lg:border-[#d9e3db] lg:shadow-[0_30px_90px_#173b2e17]">
        <aside className="hidden border-r border-[#dce5de] bg-[#f1f5f0] p-6 lg:flex lg:flex-col">
          <Logo />
          <nav aria-label="Navigasi utama" className="mt-12 space-y-2">
            {tabs.map((tab) => (
              <button
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "bg-[#173b2e] text-white shadow-[0_10px_24px_#173b2e24]"
                    : "text-[#607168] hover:bg-white hover:text-[#173b2e]"
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon name={tab.icon} /> {tab.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-[#d8e2da] bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1b7a50]">
              <Icon className="h-4 w-4" name="shield" /> Private by design
            </div>
            <p className="mt-2 text-xs leading-5 text-[#718078]">Data demo tersimpan lokal selama sesi ini.</p>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-[#e1e8e2] bg-[#f8faf7e8] px-5 backdrop-blur-xl sm:px-8 lg:hidden">
            <Logo />
            <div className="flex items-center gap-2">
              <InstallAppButton />
              <button
                aria-label="Notifikasi"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-[#d8e2da] bg-white text-[#365247]"
                type="button"
              >
                <Icon name="bell" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#d58d4d] ring-2 ring-white" />
              </button>
            </div>
          </header>

          {!online ? (
            <div className="bg-[#f4dfc6] px-5 py-2 text-center text-xs font-bold text-[#774d25]" role="status">
              Kamu sedang offline. FIN tetap bisa dibuka dari cache.
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-[920px] px-5 pb-32 pt-7 sm:px-8 sm:pt-10 lg:px-12 lg:pb-16 lg:pt-12">
            {activeTab === "home" ? (
              <HomeView
                annual={annual}
                openTransaction={setSelected}
                setAnnual={setAnnual}
                transactions={transactions}
              />
            ) : null}
            {activeTab === "transactions" ? (
              <TransactionsView openTransaction={setSelected} transactions={transactions} />
            ) : null}
            {activeTab === "insights" ? <InsightsView /> : null}
            {activeTab === "account" ? <AccountView online={online} /> : null}
          </main>
        </div>
      </div>

      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dce5de] bg-white/95 px-2 pb-[calc(.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_35px_#173b2e12] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {tabs.slice(0, 2).map((tab) => (
            <MobileTab active={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} tab={tab} />
          ))}
          <button
            aria-label="Tambah transaksi"
            className="mx-auto -mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-[#1b7a50] text-white shadow-[0_12px_30px_#1b7a5050] transition active:scale-95"
            onClick={() => setAddOpen(true)}
            type="button"
          >
            <Icon className="h-7 w-7" name="plus" strokeWidth={2.2} />
          </button>
          {tabs.slice(2).map((tab) => (
            <MobileTab active={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} tab={tab} />
          ))}
        </div>
      </nav>

      <button
        aria-label="Tambah transaksi"
        className="fixed bottom-8 right-8 z-30 hidden items-center gap-2 rounded-2xl bg-[#1b7a50] px-5 py-4 text-sm font-bold text-white shadow-[0_15px_35px_#1b7a5045] transition hover:-translate-y-0.5 lg:flex"
        onClick={() => setAddOpen(true)}
        type="button"
      >
        <Icon name="plus" /> Tambah transaksi
      </button>

      {selected ? (
        <TransactionSheet onClose={() => setSelected(null)} onReview={() => review(selected.id)} transaction={selected} />
      ) : null}
      {addOpen ? <AddTransactionSheet onClose={() => setAddOpen(false)} onSubmit={addTransaction} /> : null}
    </div>
  );
}

function MobileTab({
  tab,
  active,
  onClick,
}: {
  tab: { id: Tab; label: string; icon: IconName };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 py-1 text-[10px] font-bold ${active ? "text-[#1b7a50]" : "text-[#849088]"}`}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-5 w-5" name={tab.icon} strokeWidth={active ? 2.3 : 1.8} />
      {tab.label}
    </button>
  );
}

function TransactionSheet({
  transaction,
  onClose,
  onReview,
}: {
  transaction: Transaction;
  onClose: () => void;
  onReview: () => void;
}) {
  return (
    <div
      aria-labelledby="transaction-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] grid place-items-end bg-[#10271fb3] p-3 backdrop-blur-sm sm:place-items-center"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-[1.8rem] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f0f4ef] text-2xl">{transaction.emoji}</span>
          <button
            aria-label="Tutup detail transaksi"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#dfe7e1] text-[#718078]"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 className="mt-5 text-2xl font-black tracking-[-0.04em] text-[#173b2e]" id="transaction-title">
          {transaction.merchant}
        </h2>
        <p className="mt-1 text-sm text-[#718078]">{transaction.category} · {transaction.method}</p>
        <p className="mt-6 text-4xl font-black tracking-[-0.055em] text-[#173b2e]">
          {formatRupiah(transaction.amount)}
        </p>
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-[#f1f5f1] px-4 py-3 text-sm">
          <span className="text-[#66766e]">AI confidence</span>
          <span className="font-bold text-[#1b7a50]">{transaction.confidence}%</span>
        </div>
        {!transaction.reviewed ? (
          <button
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1b7a50] px-5 py-3.5 text-sm font-bold text-white"
            onClick={onReview}
            type="button"
          >
            <Icon name="check" /> Konfirmasi transaksi
          </button>
        ) : (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-[#1b7a50]">
            <Icon name="check" /> Sudah ditinjau
          </p>
        )}
      </div>
    </div>
  );
}

function AddTransactionSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      aria-labelledby="add-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] grid place-items-end bg-[#10271fb3] p-3 backdrop-blur-sm sm:place-items-center"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <form className="w-full max-w-md rounded-[1.8rem] bg-white p-6 shadow-2xl sm:p-8" onSubmit={onSubmit}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1b7a50]">Catat manual</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#173b2e]" id="add-title">
              Transaksi baru
            </h2>
          </div>
          <button
            aria-label="Tutup form transaksi"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#dfe7e1] text-[#718078]"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>
        <label className="mt-6 block text-xs font-bold uppercase tracking-[0.12em] text-[#718078]">
          Merchant
          <input
            autoFocus
            className="mt-2 w-full rounded-2xl border border-[#d9e3db] px-4 py-3.5 text-base font-semibold normal-case tracking-normal outline-none focus:border-[#1b7a50]"
            name="merchant"
            placeholder="Contoh: Warung Bu Tini"
            required
          />
        </label>
        <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-[#718078]">
          Jumlah
          <div className="mt-2 flex items-center rounded-2xl border border-[#d9e3db] px-4 focus-within:border-[#1b7a50]">
            <span className="font-bold text-[#718078]">Rp</span>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 py-3.5 text-base font-semibold normal-case tracking-normal outline-none"
              inputMode="numeric"
              min="1"
              name="amount"
              placeholder="0"
              required
              type="number"
            />
          </div>
        </label>
        <button
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1b7a50] px-5 py-3.5 text-sm font-bold text-white"
          type="submit"
        >
          Simpan transaksi <Icon name="arrow" />
        </button>
      </form>
    </div>
  );
}

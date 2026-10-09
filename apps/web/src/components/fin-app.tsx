"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

import { Icon, IconName } from "@/components/icon";
import { InstallAppButton } from "@/components/install-app-button";
import {
  BudgetCategory,
  compactRupiah,
  formatRupiah,
  initialCategories,
  initialTransactions,
  Transaction,
} from "@/data/sample-data";

type Tab = "home" | "transactions" | "tools" | "accounts";
type TransactionFilter = "all" | "review";

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: "home", label: "Beranda", icon: "home" },
  { id: "transactions", label: "Transaksi", icon: "transactions" },
  { id: "tools", label: "Fitur", icon: "tools" },
  { id: "accounts", label: "Akun", icon: "bank" },
];

const months = ["Okt 26", "Sep 26", "Agt 26", "Jul 26", "Jun 26", "Mei 26", "Apr 26", "Mar 26", "Feb 26", "Jan 26", "Des 25"];
const totalSpent = 4_735_200;

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
    <div className="brand" aria-label="FINCOUNTANT demo">
      <span className="brand-bot" aria-hidden="true">
        <span className="brand-bot-eye" />
        <span className="brand-bot-eye" />
      </span>
      <span className="brand-word">FINCOUNTANT</span>
      <span className="demo-tag">DEMO</span>
    </div>
  );
}

function HeaderActions() {
  return (
    <div className="header-actions">
      <button className="icon-action" aria-label="Buka notifikasi" type="button">
        <Icon name="bell" />
        <span className="notification-badge">1</span>
      </button>
      <button className="credit-action" aria-label="Lihat saldo kredit demo" type="button">
        <Icon name="credit" />
        <span>3</span>
        <span className="warning-mark" aria-hidden="true">!</span>
      </button>
    </div>
  );
}

function Sidebar({ activeTab, onChange, onAdd }: { activeTab: Tab; onChange: (tab: Tab) => void; onAdd: () => void }) {
  return (
    <aside className="sidebar">
      <Logo />
      <div className="sidebar-rule" />
      <nav className="sidebar-nav" aria-label="Navigasi utama">
        {tabs.map((tab) => (
          <button
            aria-current={activeTab === tab.id ? "page" : undefined}
            className="sidebar-link"
            data-active={activeTab === tab.id}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <Icon name={tab.icon} strokeWidth={activeTab === tab.id ? 2.1 : 1.7} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <button className="sidebar-add" onClick={onAdd} type="button">
        <Icon name="plus" />
        <span>Tambah Transaksi</span>
      </button>
      <p className="demo-note">Prototype lokal · data contoh</p>
    </aside>
  );
}

function BottomNav({ activeTab, onChange, onAdd }: { activeTab: Tab; onChange: (tab: Tab) => void; onAdd: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigasi bawah">
      {tabs.slice(0, 2).map((tab) => <BottomTab active={activeTab === tab.id} key={tab.id} onClick={() => onChange(tab.id)} tab={tab} />)}
      <BottomTab active={activeTab === "tools"} onClick={() => onChange("tools")} tab={tabs[2]} />
      <BottomTab active={activeTab === "accounts"} onClick={() => onChange("accounts")} tab={tabs[3]} />
      <button className="bottom-tab bottom-add" onClick={onAdd} type="button">
        <Icon name="plus" />
        <span>Tambah</span>
      </button>
    </nav>
  );
}

function BottomTab({ active, onClick, tab }: { active: boolean; onClick: () => void; tab: { label: string; icon: IconName } }) {
  return (
    <button aria-current={active ? "page" : undefined} className="bottom-tab" data-active={active} onClick={onClick} type="button">
      <Icon name={tab.icon} strokeWidth={active ? 2.1 : 1.7} />
      <span>{tab.label}</span>
    </button>
  );
}

function AppHeader({ compact }: { compact: boolean }) {
  return (
    <header className="app-header" data-compact={compact}>
      <Logo />
      <HeaderActions />
    </header>
  );
}

function NoticeCard() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <section className="notice-card" aria-label="Pemberitahuan demo">
      <span className="notice-icon"><Icon name="credit" /></span>
      <div>
        <h2>Kredit hampir habis</h2>
        <p>Isi ulang segera agar transaksimu tetap diproses.</p>
      </div>
      <button aria-label="Tutup notifikasi" onClick={() => setVisible(false)} type="button"><Icon name="close" /></button>
    </section>
  );
}

function PeriodControls() {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(months[0]);
  return (
    <>
      <div className="period-switch" aria-label="Rentang laporan">
        <button aria-pressed={period === "month"} onClick={() => setPeriod("month")} type="button">Bulan</button>
        <button aria-pressed={period === "year"} onClick={() => setPeriod("year")} type="button">Tahun</button>
      </div>
      <div className="month-strip" aria-label="Pilih bulan">
        {months.map((item) => (
          <button aria-pressed={month === item} key={item} onClick={() => setMonth(item)} type="button">{item}</button>
        ))}
      </div>
    </>
  );
}

function SpendingChart() {
  return (
    <section className="chart-card" aria-labelledby="month-progress-title">
      <div className="chart-card-head">
        <h2 id="month-progress-title">BULAN BERJALAN</h2>
        <div className="chart-range" aria-label="Rentang grafik"><button aria-pressed="true" type="button">30D</button><button type="button">12M</button></div>
      </div>
      <svg className="spending-chart" viewBox="0 0 960 230" role="img" aria-label="Grafik akumulasi pengeluaran demo bulan Oktober">
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".36" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M2 197C52 194 70 187 92 170S112 119 136 114S161 114 177 74S186 32 214 25L214 205H2Z" fill="url(#chart-fill)" />
        <path d="M2 197C52 194 70 187 92 170S112 119 136 114S161 114 177 74S186 32 214 25" fill="none" stroke="var(--accent)" strokeLinecap="round" strokeWidth="4" />
        <path d="M2 202C144 202 193 204 274 201S410 191 503 187S630 181 700 163S814 152 958 140" fill="none" stroke="var(--chart-muted)" strokeDasharray="7 9" strokeLinecap="round" strokeWidth="3" />
        <path d="M2 205H958" stroke="var(--line)" strokeWidth="2" />
      </svg>
      <div className="chart-dates"><span>1 Okt</span><span>30 Okt</span></div>
      <FinBuddy />
    </section>
  );
}

function FinBuddy() {
  return (
    <div className="fin-buddy" aria-hidden="true">
      <span className="buddy-antenna" />
      <span className="buddy-head"><i /><i /></span>
      <span className="buddy-body">F</span>
    </div>
  );
}

function CategoryList({ categories }: { categories: BudgetCategory[] }) {
  return (
    <section className="category-block" aria-labelledby="category-title">
      <select id="category-title" aria-label="Kelompok kategori" defaultValue="category"><option value="category">Kategori</option><option>Keinginan / Kebutuhan</option></select>
      <div className="category-list">
        {categories.map((category) => {
          const percent = Math.round((category.amount / category.budget) * 100);
          return (
            <button className="category-row" key={category.id} type="button">
              <span className="category-emoji" aria-hidden="true">{category.emoji}</span>
              <span className="category-copy"><strong>{percent}% {category.name}</strong><span className="progress-track"><span style={{ width: `${Math.min(percent, 100)}%` }} /></span></span>
              <span>{compactRupiah(category.amount)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReviewList({ transactions, onSelect }: { transactions: Transaction[]; onSelect: (transaction: Transaction) => void }) {
  return (
    <section className="review-block" aria-labelledby="review-title">
      <div className="section-title-row"><h2 id="review-title">UNTUK DITINJAU</h2><button type="button">LIHAT SEMUA</button></div>
      <p className="review-date">JUM, 09 OKT 2026</p>
      <div>
        {transactions.filter((item) => !item.reviewed).slice(0, 3).map((transaction) => (
          <button className="mini-transaction" key={transaction.id} onClick={() => onSelect(transaction)} type="button">
            <span className="transaction-emoji">{transaction.emoji}</span>
            <span><strong>{transaction.merchant}</strong><small>{transaction.category}</small></span>
            <span>{formatRupiah(transaction.amount)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeView({ categories, transactions, onSelect }: { categories: BudgetCategory[]; transactions: Transaction[]; onSelect: (transaction: Transaction) => void }) {
  return (
    <div className="view-enter home-view">
      <h1 className="sr-only">Ringkasan keuangan</h1>
      <NoticeCard />
      <PeriodControls />
      <section className="spending-hero" aria-label="Ringkasan pengeluaran demo">
        <p>{formatRupiah(totalSpent)}</p>
        <span><strong>↑ 620rb lebih</strong> vs laju bulan lalu</span>
      </section>
      <SpendingChart />
      <CategoryList categories={categories} />
      <div className="comparison-card"><span>Weekday <strong>186K/hari</strong></span><span className="weekday-bar"><i /><i /></span><span>Weekend <strong>142K/hari</strong></span></div>
      <ReviewList onSelect={onSelect} transactions={transactions} />
    </div>
  );
}

function TransactionsView({ transactions, onSelect }: { transactions: Transaction[]; onSelect: (transaction: Transaction) => void }) {
  const [queryOpen, setQueryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const visible = useMemo(() => transactions.filter((transaction) => {
    const matchQuery = `${transaction.merchant} ${transaction.category}`.toLowerCase().includes(query.toLowerCase());
    return matchQuery && (filter === "all" || !transaction.reviewed);
  }), [filter, query, transactions]);
  const groups = useMemo(() => [
    { label: "JUMAT, 9 OKT", total: 173_500, rows: visible.slice(0, 3) },
    { label: "KAMIS, 8 OKT", total: 286_000, rows: visible.slice(3) },
  ].filter((group) => group.rows.length > 0), [visible]);

  return (
    <div className="view-enter transactions-view">
      <div className="page-title-row">
        <h1>Transaksi</h1>
        <div>
          <button aria-label="Cari transaksi" className="round-control" onClick={() => setQueryOpen((value) => !value)} type="button"><Icon name="search" /></button>
          <button aria-label="Filter transaksi" aria-pressed={filter === "review"} className="round-control" onClick={() => setFilter((value) => value === "all" ? "review" : "all")} type="button"><Icon name="filter" /></button>
        </div>
      </div>
      {queryOpen ? <label className="search-field"><Icon name="search" /><span className="sr-only">Cari transaksi</span><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Cari transaksi" value={query} /></label> : null}
      <div className="transaction-groups">
        {groups.map((group) => (
          <section key={group.label}>
            <div className="transaction-group-head"><h2>{group.label}</h2><span>IDR {group.total.toLocaleString("id-ID")}</span></div>
            {group.rows.map((transaction) => <TransactionRow key={transaction.id} onClick={() => onSelect(transaction)} transaction={transaction} />)}
          </section>
        ))}
        {groups.length === 0 ? <div className="empty-state"><Icon name="search" /><h2>Transaksi tidak ditemukan</h2><p>Coba kata kunci atau filter lain.</p></div> : null}
      </div>
    </div>
  );
}

function TransactionRow({ transaction, onClick }: { transaction: Transaction; onClick: () => void }) {
  return (
    <button className="transaction-row" onClick={onClick} type="button">
      <span className="transaction-emoji">{transaction.emoji}</span>
      <span className="transaction-main"><strong>{transaction.merchant}</strong><small>{transaction.category} {!transaction.reviewed ? <em><Icon name="clock" /> Perlu tinjau</em> : null}</small></span>
      <span className="transaction-amount"><strong>IDR {transaction.amount.toLocaleString("id-ID")}</strong><small>{transaction.method}<i>{transaction.method.slice(0, 1)}</i></small></span>
    </button>
  );
}

function ToolsView({ onBudget }: { onBudget: () => void }) {
  return (
    <div className="view-enter simple-view">
      <h1>Fitur</h1>
      <div className="tool-grid">
        <button className="tool-card" onClick={onBudget} type="button">
          <span className="tool-icon"><Icon name="insights" /></span>
          <span className="tool-copy"><strong>Anggaran</strong><small>Atur anggaran per kategori</small><span>Buka: <i>Anggaran Terpakai</i><i>Keinginan / Kebutuhan</i></span></span>
          <em>Atur</em>
        </button>
        <button className="tool-card" type="button">
          <span className="tool-icon"><Icon name="sparkles" /></span>
          <span className="tool-copy"><strong>Net Worth</strong><small>Pantau nilai aset dan liabilitas</small><span>Buka: <i>Net Worth</i><i>Runway</i></span></span>
          <em>Atur</em>
        </button>
      </div>
    </div>
  );
}

function AccountsView() {
  return (
    <div className="view-enter simple-view account-view">
      <h1>Akun</h1>
      <section className="account-card">
        <div><span className="account-bank"><Icon name="bank" /></span><span><strong>Bank Demo</strong><small>Terhubung · sinkronisasi lokal</small></span></div>
        <span>Aktif</span>
      </section>
      <section className="privacy-card">
        <Icon name="shield" />
        <div><h2>Data demo, bukan akun asli</h2><p>Branch ini hanya meniru struktur antarmuka. Tidak ada data finansial, kredensial, atau koneksi bank yang disalin.</p></div>
      </section>
      <section className="install-card"><div><h2>Pasang sebagai aplikasi</h2><p>Akses lebih cepat dari home screen dan gunakan shell saat offline.</p></div><InstallAppButton /></section>
    </div>
  );
}

function BudgetIntentModal({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  return (
    <ModalFrame label="Atur Anggaran" onClose={onClose}>
      <div className="modal-heading"><h2>Atur Anggaran</h2><CloseButton onClose={onClose} /></div>
      <div className="budget-intents">
        <button onClick={onContinue} type="button"><span>✨</span><strong>Anggaran Cerdas <em>REKOMENDASI</em></strong><small>Mulai anggaran berdasarkan pengeluaran terbaru Anda</small></button>
        <button onClick={onContinue} type="button"><span>✏️</span><strong>Anggaran Manual</strong><small>Mulai anggaran dari awal per kategori</small></button>
      </div>
    </ModalFrame>
  );
}

function BudgetEditorModal({ categories, onClose, onSave }: { categories: BudgetCategory[]; onClose: () => void; onSave: (categories: BudgetCategory[]) => void }) {
  const [draft, setDraft] = useState(categories);
  const update = (id: string, value: number) => setDraft((items) => items.map((item) => item.id === id ? { ...item, budget: value } : item));
  return (
    <ModalFrame label="Anggaran per kategori" onClose={onClose} wide>
      <div className="modal-heading"><div><p className="eyebrow">OKTOBER 2026</p><h2>Anggaran per kategori</h2></div><CloseButton onClose={onClose} /></div>
      <div className="budget-editor-list">
        {draft.map((category) => (
          <label key={category.id}><span className="category-emoji">{category.emoji}</span><span><strong>{category.name}</strong><small>Terpakai {compactRupiah(category.amount)}</small></span><span className="budget-input"><i>Rp</i><input min={category.amount} onChange={(event) => update(category.id, Number(event.target.value))} type="number" value={category.budget} /></span></label>
        ))}
      </div>
      <button className="primary-button" onClick={() => onSave(draft)} type="button">Simpan anggaran <Icon name="arrow" /></button>
    </ModalFrame>
  );
}

function TransactionModal({ transaction, onClose, onReview }: { transaction: Transaction; onClose: () => void; onReview: () => void }) {
  return (
    <ModalFrame label={`Detail transaksi ${transaction.merchant}`} onClose={onClose}>
      <div className="modal-heading"><div><p className="eyebrow">DETAIL TRANSAKSI</p><h2>{transaction.merchant}</h2></div><CloseButton onClose={onClose} /></div>
      <div className="transaction-detail-amount">{formatRupiah(transaction.amount)}</div>
      <dl className="detail-list"><div><dt>Kategori</dt><dd>{transaction.category}</dd></div><div><dt>Metode</dt><dd>{transaction.method}</dd></div><div><dt>Tanggal</dt><dd>{transaction.date}, {transaction.time}</dd></div><div><dt>Sumber</dt><dd>{transaction.source}</dd></div></dl>
      {!transaction.reviewed ? <button className="primary-button" onClick={onReview} type="button"><Icon name="check" /> Tandai sudah ditinjau</button> : <p className="reviewed-state"><Icon name="check" /> Sudah ditinjau</p>}
    </ModalFrame>
  );
}

function AddTransactionModal({ categories, onClose, onSubmit }: { categories: BudgetCategory[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalFrame label="Tambah transaksi" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-heading"><div><p className="eyebrow">MANUAL</p><h2>Tambah Transaksi</h2></div><CloseButton onClose={onClose} /></div>
        <label className="field-label">Merchant<input autoFocus name="merchant" placeholder="Contoh: Kopi Sudut" required /></label>
        <label className="field-label">Jumlah<span className="currency-field"><i>Rp</i><input inputMode="numeric" min="1" name="amount" placeholder="0" required type="number" /></span></label>
        <label className="field-label">Kategori<select name="category">{categories.map((category) => <option key={category.id}>{category.name}</option>)}</select></label>
        <button className="primary-button" type="submit">Simpan transaksi <Icon name="arrow" /></button>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, label, onClose, wide = false }: { children: React.ReactNode; label: string; onClose: () => void; wide?: boolean }) {
  return (
    <div aria-label={label} aria-modal="true" className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }} role="dialog">
      <div className="modal-card" data-wide={wide}>{children}</div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return <button aria-label="Tutup" className="modal-close" onClick={onClose} type="button"><Icon name="close" /></button>;
}

export function FinApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [transactions, setTransactions] = useState(initialTransactions);
  const [categories, setCategories] = useState(initialCategories);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [budgetIntentOpen, setBudgetIntentOpen] = useState(false);
  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false);
  const online = useOnlineStatus();

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  const addTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = categories.find((item) => item.name === String(data.get("category"))) ?? categories[0];
    setTransactions((items) => [{
      id: Date.now(),
      merchant: String(data.get("merchant") || "Transaksi baru"),
      category: category.name,
      amount: Number(data.get("amount")) || 0,
      date: "Hari ini",
      isoDate: "2026-10-09",
      time: "Sekarang",
      method: "Tunai",
      source: "Manual",
      sourceDetail: "Ditambahkan secara manual pada prototype ini.",
      icon: category.icon,
      emoji: category.emoji,
      confidence: 100,
      reviewed: true,
    }, ...items]);
    setAddOpen(false);
    changeTab("transactions");
  };

  const markReviewed = () => {
    if (!selected) return;
    setTransactions((items) => items.map((item) => item.id === selected.id ? { ...item, reviewed: true } : item));
    setSelected(null);
  };

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onAdd={() => setAddOpen(true)} onChange={changeTab} />
      <div className="app-main">
        <AppHeader compact={activeTab !== "home"} />
        {!online ? <div className="offline-banner" role="status">Kamu sedang offline. Data demo tetap tersedia.</div> : null}
        <main className="content-shell">
          {activeTab === "home" ? <HomeView categories={categories} onSelect={setSelected} transactions={transactions} /> : null}
          {activeTab === "transactions" ? <TransactionsView onSelect={setSelected} transactions={transactions} /> : null}
          {activeTab === "tools" ? <ToolsView onBudget={() => setBudgetIntentOpen(true)} /> : null}
          {activeTab === "accounts" ? <AccountsView /> : null}
        </main>
      </div>
      <BottomNav activeTab={activeTab} onAdd={() => setAddOpen(true)} onChange={changeTab} />

      {selected ? <TransactionModal onClose={() => setSelected(null)} onReview={markReviewed} transaction={selected} /> : null}
      {addOpen ? <AddTransactionModal categories={categories} onClose={() => setAddOpen(false)} onSubmit={addTransaction} /> : null}
      {budgetIntentOpen ? <BudgetIntentModal onClose={() => setBudgetIntentOpen(false)} onContinue={() => { setBudgetIntentOpen(false); setBudgetEditorOpen(true); }} /> : null}
      {budgetEditorOpen ? <BudgetEditorModal categories={categories} onClose={() => setBudgetEditorOpen(false)} onSave={(next) => { setCategories(next); setBudgetEditorOpen(false); }} /> : null}
    </div>
  );
}

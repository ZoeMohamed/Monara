"use client";

import { Alert, Button } from "@monara/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppSessionContext } from "@/components/app-session-context";
import { DemoIndicator } from "@/components/demo-indicator";
import { Icon, type IconName } from "@/components/icon";
import { Logo } from "@/components/logo";
import { ModalDialog } from "@/components/modal-dialog";
import styles from "@/components/monara-app.module.css";
import { MonaraMascot } from "@/components/monara-mascot";
import { ProductTour } from "@/components/product-tour";
import { TransactionDetails } from "@/components/transaction-details";
import { type TransactionDraft, TransactionEditor } from "@/components/transaction-editor";
import { type SaveNotice, useMonaraSession } from "@/components/use-monara-session";
import type { AppScreen } from "@/data/app-navigation";
import { demoToday, type Reminder, type Transaction } from "@/data/demo-ledger";
import type { AuthenticatedProfile } from "@/lib/auth/identity";
import type { FinanceSnapshot } from "@/lib/finance/presentation";

type Tab = AppScreen;
type TabItem = { id: Tab; label: string; icon: IconName };

const tabs: TabItem[] = [
  { id: "home", label: "Overview", icon: "home" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "budgets", label: "Budgets", icon: "budgets" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "account", label: "Profile", icon: "account" },
];

const mobileTabs: TabItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "transactions", label: "History", icon: "transactions" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "budgets", label: "Budgets", icon: "budgets" },
];

function RemindersSheet({ reminders, onClose }: { reminders: Reminder[]; onClose: () => void }) {
  return (
    <ModalDialog labelledBy="reminders-title" onClose={onClose}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="reminders-title" className="text-lg font-black tracking-[-0.03em]">
            Reminders
          </h2>
          <Button
            aria-label="Close reminders"
            className="rounded-full"
            isIconOnly
            onPress={onClose}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {reminders.length > 0 ? (
          <ul className="mt-2 divide-y divide-separator">
            {reminders.map((reminder) => (
              <li className="flex gap-2.5 py-3 text-sm" key={reminder.id}>
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                  name={reminder.kind === "budget" ? "budgets" : "bell"}
                />
                {reminder.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">You’re all caught up.</p>
        )}
        <p className="mt-2 text-xs text-muted">
          Budgets alert at 80% and 100%. Bills remind 3 days before and on the due date.
        </p>
      </div>
    </ModalDialog>
  );
}

function DesktopSidebar({
  activeTab,
  hrefFor,
  reminderCount,
  onOpenReminders,
  onAdd,
  live,
}: {
  activeTab: Tab;
  hrefFor: (tab: Tab) => string;
  reminderCount: number;
  onOpenReminders: () => void;
  onAdd: () => void;
  live: boolean;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface p-5 lg:flex lg:flex-col">
      <Logo />
      <nav aria-label="Main navigation" className="mt-8 space-y-1">
        {tabs.map((tab) => (
          <Link
            href={hrefFor(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`flex min-h-11 w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              activeTab === tab.id
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
            key={tab.id}
          >
            <Icon name={tab.icon} /> {tab.label}
          </Link>
        ))}
      </nav>
      <Button
        variant="ghost"
        className="mt-4 h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-muted hover:bg-surface hover:text-foreground"
        onPress={() => onOpenReminders()}
      >
        <Icon name="bell" /> Reminders
        {reminderCount > 0 ? (
          <span className="ml-auto rounded-full bg-warning-soft px-2 text-xs text-warning-soft-foreground tabular-nums">
            {reminderCount}
          </span>
        ) : null}
      </Button>
      <div className="mt-auto flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-3">
        <span className="min-w-0 text-xs text-warning-soft-foreground">
          {live ? (
            <>
              <strong className="block text-sm">Private ledger</strong>
              Saved to your account
            </>
          ) : (
            <DemoIndicator className="block text-sm font-bold" />
          )}
        </span>
      </div>
      <Button className="mt-3 min-h-12 w-full gap-2 rounded-full" onPress={onAdd}>
        <Icon name="plus" />
        Add transaction
      </Button>
    </aside>
  );
}

function MobileHeader({
  profile,
  demo,
  today,
  reminderCount,
  onOpenReminders,
  onOpenProfile,
  onOpenCalendar,
}: {
  profile: AuthenticatedProfile;
  demo: boolean;
  today: string;
  reminderCount: number;
  onOpenReminders: () => void;
  onOpenProfile: () => void;
  onOpenCalendar: () => void;
}) {
  const date = new Date(`${today}T00:00:00Z`);
  const monthLabel = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;
  return (
    <header className={`${styles.mobileHeader} lg:hidden`}>
      <button
        aria-label={demo ? "Demo space. Open profile" : `${profile.displayName}. Open profile`}
        className={styles.spaceButton}
        data-tour="space"
        onClick={onOpenProfile}
        type="button"
      >
        <span aria-hidden className={styles.avatar}>
          {demo ? <MonaraMascot className={styles.avatarMascot} /> : profile.initials}
        </span>
        {demo ? (
          <DemoIndicator className={styles.spaceName} />
        ) : (
          <span className={styles.spaceName}>{firstName}</span>
        )}
        <Icon className={styles.spaceChevron} name="chevron-down" strokeWidth={2.2} />
      </button>
      <div className={styles.headerActions}>
        <button
          aria-label={`Today, ${date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}. Open reports`}
          className={styles.dateBadge}
          onClick={onOpenCalendar}
          type="button"
        >
          <span aria-hidden>{monthLabel}</span>
          <strong aria-hidden>{Number(today.slice(8, 10))}</strong>
        </button>
        <button
          aria-label={reminderCount > 0 ? `Reminders, ${reminderCount} active` : "Reminders"}
          className={styles.reminderButton}
          onClick={onOpenReminders}
          type="button"
        >
          <Icon className="h-5 w-5" name="bell" />
          {reminderCount > 0 ? <span aria-hidden className={styles.reminderDot} /> : null}
        </button>
      </div>
    </header>
  );
}

function BottomNav({
  activeTab,
  hrefFor,
  onAdd,
}: {
  activeTab: Tab;
  hrefFor: (tab: Tab) => string;
  onAdd: () => void;
}) {
  const activeIndex = mobileTabs.findIndex((tab) => tab.id === activeTab);
  return (
    <nav aria-label="Bottom navigation" className={`${styles.bottomNav} lg:hidden`}>
      <div className={styles.navItems}>
        <span
          aria-hidden
          className={styles.navIndicator}
          data-visible={activeIndex >= 0}
          style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
        />
        {mobileTabs.map((tab) => (
          <MobileTab active={activeTab === tab.id} key={tab.id} href={hrefFor(tab.id)} tab={tab} />
        ))}
        <button
          aria-label="Add transaction"
          className={styles.navAdd}
          data-tour="add"
          onClick={onAdd}
          type="button"
        >
          <span aria-hidden className={styles.addIcon}>
            <Icon name="plus" strokeWidth={2.4} />
          </span>
          Add
        </button>
      </div>
    </nav>
  );
}

function RejectDialog({
  transaction,
  onCancel,
  onReject,
  pending,
  error,
}: {
  transaction: Transaction;
  onCancel: () => void;
  onReject: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <ModalDialog
      labelledBy="reject-title"
      onClose={() => {
        if (!pending) onCancel();
      }}
    >
      <div className="p-4 sm:p-5">
        <h2 id="reject-title" className="text-xl font-bold">
          Reject this transaction?
        </h2>
        <p className="mt-3 break-words text-sm leading-6 text-muted">
          {transaction.merchant ?? "This transaction"} will leave the Review Queue and stay out of
          totals. {transaction.backend ? "This imported record will stay rejected." : ""}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2 sm:mt-6 sm:gap-3">
          <Button variant="secondary" className="min-h-11" onPress={onCancel} isDisabled={pending}>
            Keep pending
          </Button>
          <Button variant="danger" className="min-h-11" onPress={onReject} isDisabled={pending}>
            {pending ? "Rejecting…" : "Reject transaction"}
          </Button>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}

function SessionNotice({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: SaveNotice | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2">
      <p className="min-w-0 flex-1 text-sm font-semibold" role="status">
        {notice.message}
      </p>
      {notice.undo ? (
        <Button className="rounded-full text-accent" onPress={onUndo} size="sm" variant="ghost">
          Undo
        </Button>
      ) : null}
      <Button
        aria-label="Dismiss message"
        className="rounded-full"
        isIconOnly
        onPress={onDismiss}
        variant="ghost"
      >
        <Icon name="close" />
      </Button>
    </div>
  );
}

function MissingTransaction({ onClose }: { onClose: () => void }) {
  return (
    <ModalDialog labelledBy="missing-transaction" onClose={onClose}>
      <div className="p-5">
        <h2 id="missing-transaction" className="text-xl font-bold">
          Transaction unavailable
        </h2>
        <p className="mt-2 text-sm text-muted">This record may have changed or been removed.</p>
        <Button className="mt-4 w-full" onPress={onClose}>
          Close
        </Button>
      </div>
    </ModalDialog>
  );
}

function draftForMonth(month: string, today = demoToday, live = false): TransactionDraft {
  return {
    merchant: "",
    amount: "",
    date: month === today.slice(0, 7) ? today : `${month}-01`,
    time: "",
    kind: "expense",
    currency: "IDR",
    category: null,
    method: null,
    ...(live ? { fromAccount: null, toAccount: null } : {}),
  };
}

type Workspace = ReturnType<typeof useMonaraSession>;

export function MonaraApp({
  children,
  profile,
  initialFinance,
}: {
  children: ReactNode;
  profile: AuthenticatedProfile;
  initialFinance?: FinanceSnapshot;
}) {
  const workspace = useMonaraSession(profile, initialFinance);
  return (
    <AppSessionContext value={workspace.session}>
      <AppChrome workspace={workspace}>{children}</AppChrome>
    </AppSessionContext>
  );
}

function AppChrome({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const { session, live, view, mainRef, notice, setNotice, undo, sync } = workspace;
  const { profile, navigation, today, currentMonth, reminders, online, amountsHidden } = session;
  return (
    <div
      className={`${styles.shell} min-h-dvh bg-background text-foreground`}
      data-amounts-hidden={amountsHidden}
      data-screen={view.screen}
    >
      <a
        className="fixed top-2 left-2 z-50 -translate-y-24 rounded-xl bg-accent px-4 py-3 font-semibold text-white focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <div className="mx-auto min-h-dvh max-w-[1760px] bg-background lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <DesktopSidebar
          activeTab={view.screen}
          hrefFor={navigation.hrefFor}
          onAdd={navigation.openAdd}
          onOpenReminders={navigation.openReminders}
          reminderCount={reminders.length}
          live={live}
        />
        <div className="min-w-0">
          <MobileHeader
            demo={!live}
            profile={profile}
            today={today}
            reminderCount={reminders.length}
            onOpenCalendar={() => navigation.navigate({ screen: "reports", month: currentMonth })}
            onOpenProfile={() => navigation.navigate({ screen: "account" })}
            onOpenReminders={navigation.openReminders}
          />
          {!online ? (
            <Alert className="rounded-none px-4 py-2" role="status" status="warning">
              <Alert.Content>
                <Alert.Title className="text-center text-xs">
                  Offline. Reconnect for sign-in and sync.
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ) : null}
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className={`${styles.main} mx-auto w-full max-w-[1280px] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3 outline-none sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] lg:px-8 lg:pb-16 xl:px-10`}
          >
            {live && (sync.pending || sync.needsRecovery) ? (
              <div
                className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-secondary px-4 py-3"
                role="status"
              >
                <p className="min-w-0 flex-1 text-sm">
                  {sync.pending ? "Updating your records…" : sync.error}
                </p>
                {sync.needsRecovery ? (
                  <Button
                    isDisabled={sync.pending}
                    onPress={() => {
                      void sync.refresh().catch(() => undefined);
                    }}
                    variant="secondary"
                  >
                    Refresh records
                  </Button>
                ) : null}
              </div>
            ) : null}
            <SessionNotice notice={notice} onUndo={undo} onDismiss={() => setNotice(null)} />
            <div className={notice ? "mt-4" : ""}>{children}</div>
          </main>
        </div>
      </div>
      <BottomNav activeTab={view.screen} onAdd={navigation.openAdd} hrefFor={navigation.hrefFor} />
      <AppSheets workspace={workspace} />
    </div>
  );
}

function AppSheets({ workspace }: { workspace: Workspace }) {
  const {
    session,
    live,
    view,
    selected,
    editing,
    rejecting,
    drafts,
    setDrafts,
    editorKey,
    closeEditor,
    save,
    add,
    deleteTransaction,
    mutationPending,
    confirmError,
    rejectError,
    missing,
    tourPending,
    tourMode,
    rejectSelected,
    resources,
    sync,
  } = workspace;
  const { navigation, today, reminders, confirm } = session;
  return (
    <>
      {selected ? (
        <TransactionDetails
          key={selected.id}
          transaction={selected}
          onClose={navigation.closePopup}
          onEdit={() => navigation.openEdit(selected.id)}
          onConfirm={() => confirm(selected.id)}
          onDelete={() => deleteTransaction(selected)}
          pending={mutationPending}
          confirmationError={confirmError}
          refreshRequired={sync.needsRecovery}
          onRefreshRecords={sync.refresh}
        />
      ) : null}
      {editing ? (
        <TransactionEditor
          key={editing.id}
          transaction={editing}
          initialDraft={drafts[editorKey]}
          onDraftChange={(draft) => setDrafts((items) => ({ ...items, [editorKey]: draft }))}
          onClose={closeEditor}
          onSave={save}
          resources={resources}
          today={today}
          refreshRequired={sync.needsRecovery}
          onRefreshRecords={sync.refresh}
        />
      ) : null}
      {view.adding ? (
        <TransactionEditor
          key={editorKey}
          initialDraft={drafts[editorKey] ?? draftForMonth(view.month, today, live)}
          pristineDraft={draftForMonth(view.month, today, live)}
          onDraftChange={(draft) => setDrafts((items) => ({ ...items, [editorKey]: draft }))}
          onClose={closeEditor}
          onSave={add}
          resources={resources}
          today={today}
          refreshRequired={sync.needsRecovery}
          onRefreshRecords={sync.refresh}
        />
      ) : null}
      {missing ? <MissingTransaction onClose={navigation.closePopup} /> : null}
      {rejecting ? (
        <RejectDialog
          transaction={rejecting}
          onCancel={navigation.closePopup}
          pending={mutationPending}
          error={rejectError}
          onReject={rejectSelected}
        />
      ) : null}
      {tourPending ? <ProductTour mode={tourMode} /> : null}
      {view.remindersOpen ? (
        <RemindersSheet onClose={navigation.closePopup} reminders={reminders} />
      ) : null}
    </>
  );
}

function MobileTab({ tab, active, href }: { tab: TabItem; active: boolean; href: string }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={styles.mobileTab}>
      <Icon name={tab.icon} strokeWidth={active ? 2.3 : 1.8} />
      {tab.label}
    </Link>
  );
}

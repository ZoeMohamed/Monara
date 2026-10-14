"use client";

import { useAppSession } from "@/components/app-session-context";
import { BudgetsScreen } from "@/components/budgets-screen";
import { ChatScreen } from "@/components/chat-screen";
import { DashboardScreen } from "@/components/dashboard-screen";
import { ProfileScreen } from "@/components/profile-screen";
import { ReportsScreen } from "@/components/reports-screen";
import { TransactionsScreen } from "@/components/transactions-screen";
import { budgets } from "@/data/sample-data";

// This sample ledger is not connected to the authenticated Agent endpoint.
// Keep chat fail-closed until it shares the persistent ledger.
const sendToAgent = (): Promise<string> =>
  Promise.reject(new Error("The Agent isn't connected yet."));

export function OverviewRoute() {
  const session = useAppSession();
  const { navigation } = session;
  return (
    <DashboardScreen
      month={navigation.view.month}
      setMonth={navigation.setMonth}
      transactions={session.transactions}
      bills={session.bills}
      reminders={session.reminders}
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      openReview={session.openReview}
      openReminders={session.openReminders}
      openReports={() => navigation.navigate({ screen: "reports" })}
      openTransactions={() => navigation.navigate({ screen: "transactions", reviewOpen: false })}
      openBudgets={() => navigation.navigate({ screen: "budgets" })}
      openChat={() => navigation.navigate({ screen: "chat" })}
      openAdd={navigation.openAdd}
      openConnectGmail={navigation.openGmail}
    />
  );
}

export function TransactionsRoute() {
  const session = useAppSession();
  const { navigation } = session;
  return (
    <TransactionsScreen
      month={navigation.view.month}
      setMonth={navigation.setMonth}
      transactions={session.transactions}
      reviewOpen={navigation.view.reviewOpen}
      setReviewOpen={(reviewOpen) => navigation.navigate({ reviewOpen })}
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      onEdit={navigation.openEdit}
      onConfirm={session.confirm}
      onReject={session.reject}
      query={session.query}
      onQueryChange={session.setQuery}
      kindFilter={navigation.view.kindFilter}
      onKindChange={(kindFilter) => navigation.navigate({ kindFilter })}
      onClearFilters={() => {
        session.setQuery("");
        navigation.navigate({ kindFilter: "all" }, "replace");
      }}
      onAdd={navigation.openAdd}
      onConnectGmail={navigation.openGmail}
    />
  );
}

export function ReportsRoute() {
  const session = useAppSession();
  const { navigation } = session;
  return (
    <ReportsScreen
      month={navigation.view.month}
      setMonth={navigation.setMonth}
      transactions={session.transactions}
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      openAdd={navigation.openAdd}
      openReview={session.openReview}
      openConnectGmail={navigation.openGmail}
    />
  );
}

export function BudgetsRoute() {
  const session = useAppSession();
  return (
    <BudgetsScreen
      month={session.navigation.view.month}
      setMonth={session.navigation.setMonth}
      bills={session.bills}
      budgets={budgets}
      transactions={session.transactions}
      onConfirmBill={session.confirmBill}
      onDismissBill={session.dismissBill}
    />
  );
}

export function ChatRoute() {
  return <ChatScreen onSend={sendToAgent} />;
}
export function ProfileRoute() {
  const session = useAppSession();
  return <ProfileScreen online={session.online} profile={session.profile} />;
}

"use client";

import type { AgentChatTurn } from "@monara/contracts";
import { useRef, useState } from "react";

import { useAppSession } from "@/components/app-session-context";
import { BudgetManager, type BudgetManagerPanel } from "@/components/budget-manager";
import { BudgetsScreen } from "@/components/budgets-screen";
import { CategoryManager, DemoCategoryManager } from "@/components/category-manager";
import type { ChatReply } from "@/components/chat-action-result";
import { ChatScreen } from "@/components/chat-screen";
import { DashboardScreen } from "@/components/dashboard-screen";
import {
  DemoFinancialAccountSetup,
  FinancialAccountSetup,
} from "@/components/financial-account-setup";
import { ProfileScreen } from "@/components/profile-screen";
import { ReportsScreen } from "@/components/reports-screen";
import { TransactionsScreen } from "@/components/transactions-screen";
import { demoReply } from "@/data/demo-assistant";
import { ChatClientError, nextHistory, sendChatMessage } from "@/lib/chat/client";
import { FinanceClientError } from "@/lib/finance/client";

export function OverviewRoute() {
  const session = useAppSession();
  const { navigation } = session;
  return (
    <DashboardScreen
      setup={
        session.financeSnapshot ? (
          <FinancialAccountSetup
            snapshot={session.financeSnapshot}
            runMutation={session.runMutation}
            refreshRequired={session.refreshRequired}
            onRefreshRecords={session.refreshFinance}
          />
        ) : null
      }
      month={navigation.view.month}
      setMonth={navigation.setMonth}
      transactions={session.transactions}
      budgets={session.budgets}
      today={session.today}
      bills={session.bills}
      insights={
        session.financeSnapshot?.month === navigation.view.month
          ? session.financeSnapshot.dashboard.insights
          : undefined
      }
      amountsHidden={session.amountsHidden}
      toggleAmounts={session.toggleAmounts}
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      openTransactions={() => navigation.navigate({ screen: "transactions", reviewOpen: false })}
      openReview={session.openReview}
      openReports={() => navigation.navigate({ screen: "reports" })}
      openBudgets={() => navigation.navigate({ screen: "budgets" })}
      openChat={session.openChat}
      openAdd={navigation.openAdd}
      openConnectGmail={navigation.openGmail}
      openAccounts={() => navigation.navigate({ screen: "account" })}
    />
  );
}

export function TransactionsRoute() {
  const session = useAppSession();
  const { navigation } = session;
  return (
    <TransactionsScreen
      month={navigation.view.month}
      today={session.today}
      setMonth={navigation.setMonth}
      transactions={session.transactions}
      reviewOpen={navigation.view.reviewOpen}
      setReviewOpen={(reviewOpen) =>
        navigation.navigate(reviewOpen ? { reviewOpen, kindFilter: "all" } : { reviewOpen })
      }
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      onConfirm={session.confirm}
      query={session.query}
      onQueryChange={session.setQuery}
      kindFilter={navigation.view.kindFilter}
      onKindChange={(kindFilter) => navigation.navigate({ kindFilter, reviewOpen: false })}
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
      reportPeriod={navigation.view.reportPeriod}
      reportYear={navigation.view.reportYear}
      setReportPeriod={(reportPeriod) => navigation.navigate({ reportPeriod })}
      setReportYear={(reportYear) => navigation.navigate({ reportYear })}
      transactions={session.transactions}
      today={session.today}
      openTransaction={(transaction) => navigation.openTransaction(transaction.id)}
      openAdd={navigation.openAdd}
      openReview={session.openReview}
      openConnectGmail={navigation.openGmail}
    />
  );
}

export function BudgetsRoute() {
  const session = useAppSession();
  const [budgetPanel, setBudgetPanel] = useState<BudgetManagerPanel>(null);
  return (
    <BudgetsScreen
      demo={session.dataMode === "demo"}
      insights={
        session.financeSnapshot?.month === session.navigation.view.month
          ? session.financeSnapshot.dashboard.insights
          : undefined
      }
      onEditBudget={session.dataMode === "demo" ? session.updateDemoBudget : undefined}
      demoCategories={session.dataMode === "demo" ? session.categories : undefined}
      onCreateBudget={session.dataMode === "demo" ? session.createDemoBudget : undefined}
      onRequestCreateBudget={
        session.financeSnapshot ? () => setBudgetPanel({ kind: "create" }) : undefined
      }
      onRequestEditBudget={
        session.financeSnapshot ? (id) => setBudgetPanel({ kind: "edit", id }) : undefined
      }
      onRequestDeleteBudget={
        session.financeSnapshot ? (id) => setBudgetPanel({ kind: "delete", id }) : undefined
      }
      management={
        session.financeSnapshot ? (
          <BudgetManager
            collapseList
            hiddenBudgetIds={session.budgets.map((budget) => budget.id)}
            panel={budgetPanel}
            onPanelChange={setBudgetPanel}
            snapshot={session.financeSnapshot}
            runMutation={session.runMutation}
            refreshRequired={session.refreshRequired}
            onRefreshRecords={session.refreshFinance}
          />
        ) : undefined
      }
      month={session.navigation.view.month}
      setMonth={session.navigation.setMonth}
      bills={session.bills}
      budgets={session.budgets}
      transactions={session.transactions}
      today={session.today}
      onConfirmBill={session.confirmBill}
      onDismissBill={session.dismissBill}
    />
  );
}

export function ChatRoute() {
  const session = useAppSession();
  const history = useRef<AgentChatTurn[]>([]);
  const [conversation, setConversation] = useState(0);
  const demo = session.dataMode === "demo";

  const send = async (text: string) => {
    if (demo) {
      const result = demoReply(text, {
        transactions: session.transactions,
        budgets: session.budgets,
        bills: session.bills,
        today: session.today,
      });
      if (result.log) session.logDemoPayment(result.log.merchant, result.log.amount);
      return result.reply;
    }
    try {
      // Every turn may invoke a write, so share the ledger's mutex and recovery gate.
      return await session.runMutation<ChatReply>(
        async () => {
          try {
            const response = await sendChatMessage(text, history.current);
            history.current = nextHistory(history.current, text, response);
            return response;
          } catch (failure) {
            if (failure instanceof ChatClientError && failure.actionMayHaveCompleted) {
              // A lost reply cannot establish whether an earlier confirmation was consumed.
              history.current = history.current.map((turn) => {
                const verifiedTurn = { ...turn };
                delete verifiedTurn.confirmation;
                return verifiedTurn;
              });
              throw new FinanceClientError("DEPENDENCY_UNAVAILABLE", failure.message, null, true);
            }
            throw failure;
          }
        },
        {
          // Undo changes existing records without issuing another action receipt.
          // Reconcile every verified turn rather than inferring writes from reply text.
          refreshFailureMessage:
            "Your records could not be refreshed. Refresh before making another change.",
          onRefreshFailure: (response, refreshWarning) => ({ ...response, refreshWarning }),
        },
      );
    } catch (failure) {
      if (failure instanceof FinanceClientError && failure.actionMayHaveCompleted) {
        // Reconcile once, without replaying the possibly completed Agent action.
        await session.refreshFinance().catch(() => undefined);
      }
      throw failure;
    }
  };

  return (
    <ChatScreen
      demo={demo}
      initialPrompt={session.chatPrompt}
      key={conversation}
      onClose={() => session.navigation.navigate({ screen: "home" })}
      onNewChat={() => {
        history.current = [];
        setConversation((value) => value + 1);
      }}
      onPromptUsed={session.clearChatPrompt}
      onSend={send}
      onOpenResource={(type, id) => {
        if (type === "transaction")
          session.navigation.navigate({ screen: "transactions", transactionId: id });
        else session.navigation.navigate({ screen: "budgets" });
      }}
    />
  );
}
export function ProfileRoute() {
  const session = useAppSession();
  return (
    <ProfileScreen
      financialCategories={
        session.financeSnapshot ? (
          <CategoryManager
            snapshot={session.financeSnapshot}
            runMutation={session.runMutation}
            refreshRequired={session.refreshRequired}
            onRefreshRecords={session.refreshFinance}
          />
        ) : (
          <DemoCategoryManager
            categories={session.categories}
            onEdit={session.updateDemoCategory}
            onDelete={session.archiveDemoCategory}
            onCreate={session.createDemoCategory}
          />
        )
      }
      financialAccounts={
        session.financeSnapshot ? (
          <FinancialAccountSetup
            allowAdditional
            snapshot={session.financeSnapshot}
            runMutation={session.runMutation}
            refreshRequired={session.refreshRequired}
            onRefreshRecords={session.refreshFinance}
          />
        ) : (
          <DemoFinancialAccountSetup
            accounts={session.financialAccounts}
            onCreate={session.createDemoAccount}
            onUpdate={session.updateDemoAccount}
          />
        )
      }
      demo={session.dataMode === "demo"}
      online={session.online}
      onOpenReminders={session.openReminders}
      onReplayTour={session.replayTour}
      profile={session.profile}
    />
  );
}

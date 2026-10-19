"use client";

import { useEffect, useRef, useState } from "react";

import { useAppSession } from "@/components/app-session-context";
import { BudgetManager, type BudgetManagerPanel } from "@/components/budget-manager";
import { BudgetsScreen } from "@/components/budgets-screen";
import { CategoryManager, DemoCategoryManager } from "@/components/category-manager";
import type { ChatReply } from "@/components/chat-action-result";
import { ChatScreen } from "@/components/chat-screen";
import { useChatSession } from "@/components/chat-session-context";
import { DashboardScreen } from "@/components/dashboard-screen";
import {
  DemoFinancialAccountSetup,
  FinancialAccountSetup,
} from "@/components/financial-account-setup";
import { ProfileScreen } from "@/components/profile-screen";
import { ReportsScreen } from "@/components/reports-screen";
import { TransactionsScreen } from "@/components/transactions-screen";
import { demoReply } from "@/data/demo-assistant";
import {
  ChatClientError,
  loadChatConversations,
  loadChatMessages,
  nextHistory,
  sendChatMessage,
} from "@/lib/chat/client";
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
      weeklyBudgets={session.financeSnapshot?.allBudgets.filter(
        (budget) => budget.cadence === "weekly",
      )}
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
      openBudgets={() => navigation.navigate({ screen: "budgets" })}
      openChat={session.openChat}
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
        navigation.navigate({ kindFilter: "all", reviewOpen: false }, "replace");
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
  const chat = useChatSession();
  const conversation =
    chat.state.conversations.find((item) => item.id === chat.state.activeId) ??
    chat.state.conversations[0];
  const mounted = useRef(true);
  const { dispatch } = chat;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dispatch({ type: "close-confirmations", id: conversation.id });
    };
  }, [conversation.id, dispatch]);
  const demo = session.dataMode === "demo";

  // Saved chats are listed once per page load, then each is fetched when it is opened.
  const [listFailed, setListFailed] = useState(false);
  const listed = chat.state.listed;
  useEffect(() => {
    if (demo || listed) return;
    let current = true;
    loadChatConversations()
      .then((conversations) => {
        if (!current) return;
        setListFailed(false);
        dispatch({ type: "saved-list", conversations });
      })
      .catch(() => current && setListFailed(true));
    return () => {
      current = false;
    };
  }, [demo, listed, dispatch]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failedLoad, setFailedLoad] = useState<{ id: string; attempt: number } | null>(null);
  const conversationId = conversation.id;
  const needsLoad = !demo && !conversation.loaded;
  useEffect(() => {
    if (!needsLoad) return;
    let current = true;
    loadChatMessages(conversationId)
      .then(
        (messages) => current && dispatch({ type: "saved-messages", id: conversationId, messages }),
      )
      .catch(() => current && setFailedLoad({ id: conversationId, attempt: loadAttempt }));
    return () => {
      current = false;
    };
  }, [needsLoad, conversationId, loadAttempt, dispatch]);
  const loadFailed = failedLoad?.id === conversationId && failedLoad.attempt === loadAttempt;
  const status = !needsLoad ? "ready" : loadFailed ? "failed" : "loading";

  const requestReply = async (text: string): Promise<string | ChatReply> => {
    if (demo) {
      const result = demoReply(text, {
        transactions: session.transactions,
        budgets: session.budgets,
        bills: session.bills,
        today: session.today,
      });
      if (result.log) session.logDemoPayment(result.log.merchant, result.log.amount);
      dispatch({
        type: "history",
        id: conversation.id,
        history: nextHistory(conversation.history, text, {
          reply: result.reply,
          actions: [],
          confirmation: null,
        }),
      });
      return result.reply;
    }
    try {
      // Every turn may invoke a write, so share the ledger's mutex and recovery gate.
      return await session.runMutation<ChatReply>(
        async () => {
          try {
            const response = await sendChatMessage(text, conversation.history, conversation.id);
            const safeResponse = mounted.current ? response : { ...response, confirmation: null };
            dispatch({
              type: "history",
              id: conversation.id,
              history: nextHistory(conversation.history, text, safeResponse),
            });
            return safeResponse;
          } catch (failure) {
            if (failure instanceof ChatClientError) {
              // A lost reply cannot establish whether an earlier confirmation was consumed.
              if (failure.actionMayHaveCompleted)
                dispatch({ type: "close-confirmations", id: conversation.id });
              throw new FinanceClientError(
                failure.code,
                failure.message,
                failure.status,
                failure.actionMayHaveCompleted,
              );
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

  const send = async (text: string) => {
    if (!chat.beginSend()) throw new Error("Give me a sec to finish the current message.");
    const append = (message: {
      role: "user" | "agent" | "error";
      text: string;
      result?: ChatReply;
    }) =>
      dispatch({
        type: "message",
        id: conversation.id,
        message: { id: crypto.randomUUID(), ...message },
        at: new Date().toISOString(),
      });
    append({ role: "user", text });
    try {
      const response = await requestReply(text);
      const safeReply =
        typeof response === "string" || mounted.current
          ? response
          : { ...response, confirmation: null };
      append({
        role: "agent",
        text: typeof safeReply === "string" ? safeReply : safeReply.reply,
        ...(typeof safeReply === "string" ? {} : { result: safeReply }),
      });
      return safeReply;
    } catch (failure) {
      dispatch({ type: "close-confirmations", id: conversation.id });
      append({
        role: "error",
        text:
          failure instanceof Error
            ? failure.message
            : "Couldn’t get a reply. Give it another try in a moment.",
      });
      throw failure;
    } finally {
      chat.endSend();
    }
  };

  return (
    <ChatScreen
      demo={demo}
      initialPrompt={session.chatPrompt}
      key={conversation.id}
      messages={conversation.messages}
      conversations={chat.state.conversations}
      activeConversationId={conversation.id}
      pending={chat.pending}
      saved={!demo}
      savedLoadFailed={listFailed}
      status={status}
      onRetryLoad={() => setLoadAttempt((attempt) => attempt + 1)}
      onRestoreConversation={(id) => {
        if (!chat.pending) dispatch({ type: "restore", id });
      }}
      onAddManually={session.navigation.openAdd}
      onCheckRecords={() =>
        session.navigation.navigate({
          screen: "transactions",
          reviewOpen: false,
          kindFilter: "all",
        })
      }
      onClose={() => session.navigation.navigate({ screen: "home" })}
      onNewChat={() => {
        if (!chat.pending) dispatch({ type: "new", id: crypto.randomUUID() });
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

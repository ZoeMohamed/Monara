"use client";

import type { ReactNode } from "react";

import { MobileOverview } from "@/components/mobile-overview";
import { type Budget, demoToday, type RecurringBill, type Transaction } from "@/data/demo-ledger";
import { overviewModel } from "@/data/overview-model";

const noBills: RecurringBill[] = [];

export function DashboardScreen({
  setup,
  month,
  setMonth,
  transactions,
  budgets,
  today = demoToday,
  bills = noBills,
  amountsHidden = false,
  toggleAmounts,
  openTransaction,
  openTransactions,
  openReview,
  openReports,
  openBudgets,
  openChat,
  openAdd,
  openConnectGmail,
}: {
  setup?: ReactNode;
  month: string;
  setMonth: (month: string) => void;
  transactions: Transaction[];
  budgets: Budget[];
  today?: string;
  bills?: RecurringBill[];
  amountsHidden?: boolean;
  toggleAmounts: () => void;
  openTransaction: (transaction: Transaction) => void;
  openTransactions?: () => void;
  openReview: () => void;
  openReports: () => void;
  openBudgets: () => void;
  openChat: (prompt?: string) => void;
  openAdd?: () => void;
  openConnectGmail?: () => void;
}) {
  const model = overviewModel(transactions, budgets, bills, month, today);

  return (
    <MobileOverview
      setup={setup}
      amountsHidden={amountsHidden}
      model={model}
      month={month}
      openAdd={openAdd}
      openBudgets={openBudgets}
      openChat={openChat}
      openConnectGmail={openConnectGmail}
      openReports={openReports}
      openReview={openReview}
      openTransaction={openTransaction}
      openTransactions={openTransactions}
      setMonth={setMonth}
      today={today}
      toggleAmounts={toggleAmounts}
      transactions={transactions}
    />
  );
}

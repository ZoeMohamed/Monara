"use client";

import type { FinancialInsights } from "@monara/contracts";
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
  insights,
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
  openAccounts,
}: {
  setup?: ReactNode;
  month: string;
  setMonth: (month: string) => void;
  transactions: Transaction[];
  budgets: Budget[];
  today?: string;
  bills?: RecurringBill[];
  insights?: FinancialInsights;
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
  openAccounts?: () => void;
}) {
  const presentationModel = overviewModel(transactions, budgets, bills, month, today);
  const safeBasis = insights?.safeToSpend.overall;
  const model = insights
    ? {
        ...presentationModel,
        savingsRate: insights.savingsRate.ratePercent,
        safeToSpend:
          presentationModel.safeToSpend && safeBasis
            ? {
                ...presentationModel.safeToSpend,
                limit: BigInt(safeBasis.limit.amountMinor),
                spending: BigInt(safeBasis.spending.amountMinor),
                rawRemaining:
                  BigInt(safeBasis.remaining.amountMinor) - BigInt(safeBasis.shortfall.amountMinor),
                shortfall: BigInt(safeBasis.shortfall.amountMinor),
                remaining: BigInt(safeBasis.remaining.amountMinor),
                daysLeft: safeBasis.remainingDays,
                perDay: BigInt(safeBasis.dailyAmount.amountMinor),
              }
            : presentationModel.safeToSpend,
      }
    : presentationModel;

  return (
    <MobileOverview
      setup={setup}
      amountsHidden={amountsHidden}
      model={model}
      insights={insights}
      month={month}
      openAdd={openAdd}
      openBudgets={openBudgets}
      openChat={openChat}
      openConnectGmail={openConnectGmail}
      openAccounts={openAccounts}
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

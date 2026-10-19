"use client";

import type {
  RecurringBill as BackendRecurringBill,
  RecurringBillSuggestion,
} from "@monara/contracts";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { RecurringBill } from "@/data/demo-ledger";
import { callFinanceOperation } from "@/lib/finance/client";

function cadence(unit: BackendRecurringBill["intervalUnit"]): RecurringBill["cadence"] {
  return unit === "week" ? "weekly" : "monthly";
}

export function trackedBill(bill: BackendRecurringBill): RecurringBill {
  return {
    id: bill.id,
    merchant: bill.merchantName,
    emoji: "•",
    expectedAmount: Number(bill.expectedAmount.amountMinor),
    cadence: cadence(bill.intervalUnit),
    nextDue: bill.nextDueOn,
    cancellationUrl: bill.cancellationUrl,
    status: "active",
  };
}

function suggestedBill(suggestion: RecurringBillSuggestion): RecurringBill {
  const { proposal } = suggestion;
  return {
    id: `suggestion:${proposal.merchantName.toLocaleLowerCase()}`,
    merchant: proposal.merchantName,
    emoji: "•",
    expectedAmount: Number(proposal.expectedAmount.amountMinor),
    cadence: cadence(proposal.intervalUnit),
    nextDue: proposal.nextDueOn,
    cancellationUrl: proposal.cancellationUrl,
    status: "suggested",
    proposal,
    reason: suggestion.reason,
  };
}

/** Tracked bills plus fresh suggestions. A failed suggestion check still shows tracked bills. */
async function loadLiveBills(): Promise<RecurringBill[]> {
  const [tracked, suggested] = await Promise.all([
    callFinanceOperation("list_recurring_bills", { limit: 100, status: "active" }),
    callFinanceOperation("suggest_recurring_bills", {}).catch(() => ({ items: [] })),
  ]);
  return [...tracked.items.map(trackedBill), ...suggested.items.map(suggestedBill)];
}

/** Loads the signed-in User's bills once per visit; suggestions run the AI check. */
export function useLiveBills(live: boolean, setBills: Dispatch<SetStateAction<RecurringBill[]>>) {
  useEffect(() => {
    if (!live) return;
    let current = true;
    loadLiveBills()
      .then((bills) => {
        if (current) setBills(bills);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [live, setBills]);
}

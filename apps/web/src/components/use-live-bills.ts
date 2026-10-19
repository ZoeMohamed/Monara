"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { RecurringBill } from "@/data/demo-ledger";
import { suggestedBill, trackedBill } from "@/lib/bills/presentation";
import { callFinanceOperation } from "@/lib/finance/client";

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

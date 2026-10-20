import type {
  RecurringBill as BackendRecurringBill,
  RecurringBillSuggestion,
} from "@monara/contracts";
import type { RecurringBill } from "@/data/demo-ledger";

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

export function suggestedBill(suggestion: RecurringBillSuggestion): RecurringBill {
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

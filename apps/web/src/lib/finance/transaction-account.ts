import type { FinancialAccount } from "@monara/contracts";

/**
 * The Financial Account a transaction was paid from: by id first, then by the name it
 * carries (demo records only have the name). A custom account name cannot reveal its
 * institution, so the id match matters for live records.
 */
export function transactionAccount(
  transaction: { financialAccountId?: string | null; method: string | null },
  accounts: readonly FinancialAccount[],
) {
  return (
    (transaction.financialAccountId
      ? accounts.find((account) => account.id === transaction.financialAccountId)
      : undefined) ?? accounts.find((account) => account.name === transaction.method)
  );
}

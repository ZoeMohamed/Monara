import type {
  FinancialAccount,
  FinancialAccountPage,
  Transaction,
  TransactionKind,
  TransactionPage,
} from "@monara/contracts";

import { callFinanceOperation } from "@/lib/finance/client";

const FEED_LIMIT = 100;

export type GmailImportFeedItem = {
  id: string;
  provider: string;
  bankName: string;
  merchant: string;
  amount: number;
  date: string;
  kind: TransactionKind;
};

/** Maps a persisted Gmail transaction only when it belongs in the onboarding feed. */
function feedItem(
  transaction: Transaction,
  accounts: Map<string, FinancialAccount>,
): GmailImportFeedItem | null {
  const account = transaction.financialAccountId
    ? accounts.get(transaction.financialAccountId)
    : undefined;
  if (
    !account ||
    transaction.source !== "gmail_email" ||
    transaction.deletedAt !== null ||
    !transaction.kind ||
    !transaction.money ||
    !transaction.occurredOn
  ) {
    return null;
  }
  const amount = Number(transaction.money.amountMinor);
  if (!Number.isSafeInteger(amount)) return null;
  return {
    id: transaction.id,
    provider: account.institution ?? account.name,
    bankName: account.name,
    merchant: transaction.merchantName ?? transaction.description ?? "Transaction",
    amount,
    date: transaction.occurredOn,
    kind: transaction.kind,
  };
}

/**
 * Finds the newest transactions Gmail imported into this mailbox's accounts.
 * Accounts are fully paged, then the transaction query is scoped to those accounts
 * before its feed limit is applied.
 */
export async function loadImportFeed(
  mailboxId: string,
  signal?: AbortSignal,
): Promise<GmailImportFeedItem[]> {
  const fetcher = (input: string, init: RequestInit) => fetch(input, { ...init, signal });
  const owned = new Map<string, FinancialAccount>();
  const accountCursors = new Set<string>();
  let accountCursor: string | null = null;
  do {
    const page: FinancialAccountPage = await callFinanceOperation(
      "list_financial_accounts",
      { limit: 100, cursor: accountCursor },
      fetcher,
    );
    for (const account of page.items) {
      if (account.gmailConnectionId === mailboxId) owned.set(account.id, account);
    }
    if (page.nextCursor !== null && accountCursors.has(page.nextCursor)) {
      throw new Error("The account list did not finish loading.");
    }
    if (page.nextCursor !== null) accountCursors.add(page.nextCursor);
    accountCursor = page.nextCursor;
  } while (accountCursor !== null);
  if (owned.size === 0) return [];

  const page: TransactionPage = await callFinanceOperation(
    "list_transactions",
    { limit: FEED_LIMIT, financialAccountIds: [...owned.keys()] },
    fetcher,
  );
  return page.items.flatMap((transaction) => feedItem(transaction, owned) ?? []);
}

import {
  type Budget,
  budgetSchema,
  type Category,
  categorySchema,
  type FinancialAccount,
  type FinancialGoal,
  financialAccountSchema,
  financialGoalSchema,
  type Reminder,
  reminderSchema,
  type Transaction,
  transactionSchema,
} from "@monara/contracts";
import type { Database, MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError, type FinanceRepository } from "./finance.ts";

type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type AccountRow = Pick<
  Database["public"]["Tables"]["financial_accounts"]["Row"],
  | "id"
  | "name"
  | "institution"
  | "account_type"
  | "currency"
  | "last_four"
  | "institution_key"
  | "gmail_connection_id"
  | "is_active"
  | "created_at"
  | "updated_at"
>;
type CategoryRow = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  | "id"
  | "name"
  | "slug"
  | "icon"
  | "color"
  | "is_default"
  | "is_archived"
  | "created_at"
  | "updated_at"
>;
type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];
type FinancialGoalRow = Database["public"]["Tables"]["financial_goals"]["Row"];
type ReminderRow = Pick<
  Database["public"]["Tables"]["reminders"]["Row"],
  | "id"
  | "budget_id"
  | "recurring_bill_id"
  | "kind"
  | "status"
  | "dedupe_key"
  | "period_starts_on"
  | "threshold_percent"
  | "offset_days"
  | "title"
  | "message"
  | "scheduled_for"
  | "read_at"
  | "created_at"
  | "updated_at"
>;

const TRANSACTION_COLUMNS =
  "id, financial_account_id, category_id, source_type, transaction_type, flow_direction, merchant_name, amount::text, currency, occurred_on, occurred_time, description, location, account_hint, ai_confidence, review_status, deleted_at, created_at, updated_at";
const ACCOUNT_COLUMNS =
  "id, name, institution, account_type, currency, last_four, institution_key, gmail_connection_id, is_active, created_at, updated_at";
const CATEGORY_COLUMNS =
  "id, name, slug, icon, color, is_default, is_archived, created_at, updated_at";
const BUDGET_COLUMNS =
  "id, category_id, name, cadence, limit_amount::text, currency, warning_percent, starts_on, is_active, deleted_at, created_at, updated_at";
const FINANCIAL_GOAL_COLUMNS =
  "id, name, target_amount::text, saved_amount::text, currency, target_date, status, image_path, deleted_at, created_at, updated_at";
const REMINDER_COLUMNS =
  "id, budget_id, recurring_bill_id, kind, status, dedupe_key, period_starts_on, threshold_percent, offset_days, title, message, scheduled_for, read_at, created_at, updated_at";

type ExactTransactionRow = Omit<TransactionRow, "amount"> & { amount: string | null };
type ExactBudgetRow = Omit<BudgetRow, "limit_amount"> & { limit_amount: string };
type ExactFinancialGoalRow = Omit<FinancialGoalRow, "target_amount" | "saved_amount"> & {
  target_amount: string;
  saved_amount: string;
};

function fail(error: { code?: string }): never {
  if (error.code === "23505") {
    throw new FinanceOperationError("CONFLICT", "That change conflicts with an existing record.");
  }
  if (error.code === "23503") {
    throw new FinanceOperationError("FORBIDDEN", "A related record is unavailable.");
  }
  if (error.code === "23514" || error.code === "22P02") {
    throw new FinanceOperationError("VALIDATION_FAILED", "That change is not valid.");
  }
  throw new FinanceOperationError("INTERNAL", "The financial operation could not be completed.");
}

function offsetFor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) {
    throw new FinanceOperationError("VALIDATION_FAILED", "The page cursor is invalid.");
  }
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new FinanceOperationError("VALIDATION_FAILED", "The page cursor is invalid.");
  }
  return offset;
}

function page<T>(rows: T[], offset: number, limit: number) {
  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit),
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

/** Aggregate reads must page through PostgREST's configured 1,000-row response limit. */
async function readAllPages<T extends { id: string }>(
  readPage: (offset: number, limit: number) => Promise<T[]>,
) {
  const limit = 1_000;
  const rows: T[] = [];
  const ids = new Set<string>();
  for (let offset = 0; ; offset += limit) {
    const current = await readPage(offset, limit);
    for (const row of current) {
      if (ids.has(row.id)) {
        throw new FinanceOperationError(
          "CONFLICT",
          "Your records changed while loading. Refresh and try again.",
        );
      }
      ids.add(row.id);
    }
    rows.push(...current);
    if (current.length < limit) return rows;
  }
}

function monthRange(month: string) {
  const startsOn = `${month}-01`;
  const end = new Date(`${startsOn}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { startsOn, endsOn: end.toISOString().slice(0, 10) };
}

const databaseNumeric = (amountMinor: string) => amountMinor as unknown as number;

function toTransaction(row: ExactTransactionRow): Transaction {
  return transactionSchema.parse({
    id: row.id,
    kind: row.transaction_type,
    flowDirection: row.flow_direction,
    merchantName: row.merchant_name,
    money:
      row.amount === null || row.currency === null
        ? null
        : { amountMinor: String(row.amount), currency: row.currency },
    occurredOn: row.occurred_on,
    occurredTime: row.occurred_time,
    description: row.description,
    location: row.location,
    accountHint: row.account_hint,
    categoryId: row.category_id,
    financialAccountId: row.financial_account_id,
    reviewStatus: row.review_status,
    source: row.source_type,
    confidence: row.ai_confidence,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toAccount(row: AccountRow): FinancialAccount {
  return financialAccountSchema.parse({
    id: row.id,
    name: row.name,
    institution: row.institution,
    accountType: row.account_type,
    currency: row.currency,
    lastFour: row.last_four,
    institutionKey: row.institution_key,
    gmailConnectionId: row.gmail_connection_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toCategory(row: CategoryRow): Category {
  return categorySchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toBudget(row: ExactBudgetRow): Budget {
  return budgetSchema.parse({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    cadence: row.cadence,
    limit: { amountMinor: String(row.limit_amount), currency: row.currency },
    warningPercent: row.warning_percent,
    startsOn: row.starts_on,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toFinancialGoal(row: ExactFinancialGoalRow): FinancialGoal {
  return financialGoalSchema.parse({
    id: row.id,
    name: row.name,
    target: { amountMinor: row.target_amount, currency: row.currency },
    saved: { amountMinor: row.saved_amount, currency: row.currency },
    targetDate: row.target_date,
    status: row.status,
    imagePath: row.image_path,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toReminder(row: ReminderRow): Reminder {
  const common = {
    id: row.id,
    status: row.status,
    title: row.title,
    message: row.message,
    dedupeKey: row.dedupe_key,
    scheduledFor: row.scheduled_for,
    readAt: row.read_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return reminderSchema.parse(
    row.kind === "budget_threshold"
      ? {
          ...common,
          kind: row.kind,
          budgetId: row.budget_id,
          periodStartsOn: row.period_starts_on,
          thresholdPercent: row.threshold_percent,
        }
      : {
          ...common,
          kind: row.kind,
          recurringBillId: row.recurring_bill_id,
          offsetDays: row.offset_days,
        },
  );
}

const transactionUpdate = (
  values: Parameters<FinanceRepository["replaceTransaction"]>[0]["values"],
) => ({
  transaction_type: values.kind,
  flow_direction:
    values.kind === "expense"
      ? "out"
      : values.kind === "income"
        ? "in"
        : (values.flowDirection ?? null),
  merchant_name: values.merchantName,
  amount: values.money ? databaseNumeric(values.money.amountMinor) : null,
  currency: values.money?.currency ?? null,
  // Pending captures may omit a stated date. Inserts use the database's Jakarta
  // fallback; updates leave the already-normalized date intact.
  occurred_on: values.occurredOn ?? undefined,
  occurred_time: values.occurredTime,
  description: values.description,
  location: values.location,
  account_hint: values.accountHint,
  category_id: values.categoryId,
  financial_account_id: values.financialAccountId,
});

async function missingOrConflict(
  client: MonaraServiceRoleClient,
  table: "transactions" | "budgets" | "financial_accounts" | "financial_goals" | "categories",
  id: string,
  userId: string,
): Promise<never> {
  const result = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) fail(result.error);
  throw result.data
    ? new FinanceOperationError("CONFLICT", "This record changed. Reload it and try again.")
    : new FinanceOperationError("NOT_FOUND", "That record was not found.");
}

export function createSupabaseFinanceRepository(
  client: MonaraServiceRoleClient,
): FinanceRepository {
  const findTransaction = async (userId: string, transactionId: string) => {
    const result = await client
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("id", transactionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) fail(result.error);
    return result.data ? toTransaction(result.data as unknown as ExactTransactionRow) : null;
  };

  const findBudget = async (userId: string, budgetId: string) => {
    const result = await client
      .from("budgets")
      .select(BUDGET_COLUMNS)
      .eq("id", budgetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) fail(result.error);
    return result.data ? toBudget(result.data as unknown as ExactBudgetRow) : null;
  };

  const findFinancialGoal = async (userId: string, goalId: string) => {
    const result = await client
      .from("financial_goals")
      .select(FINANCIAL_GOAL_COLUMNS)
      .eq("id", goalId)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) fail(result.error);
    return result.data ? toFinancialGoal(result.data as unknown as ExactFinancialGoalRow) : null;
  };

  const listTransactionsForDateRange = async (userId: string, startsOn: string, endsOn: string) =>
    readAllPages(async (offset, limit) => {
      const result = await client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("occurred_on", startsOn)
        .lte("occurred_on", endsOn)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);
      if (result.error) fail(result.error);
      return (result.data as unknown as ExactTransactionRow[]).map(toTransaction);
    });

  return {
    async listTransactions(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("occurred_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit);
      if (input.reviewStatus) query = query.eq("review_status", input.reviewStatus);
      if (input.kind) query = query.eq("transaction_type", input.kind);
      if (input.financialAccountIds) {
        query = query.in("financial_account_id", input.financialAccountIds);
      }
      if (input.month) {
        const { startsOn, endsOn } = monthRange(input.month);
        query = query.gte("occurred_on", startsOn).lte("occurred_on", endsOn);
      }
      const result = await query;
      if (result.error) fail(result.error);
      return page(
        (result.data as unknown as ExactTransactionRow[]).map(toTransaction),
        offset,
        limit,
      );
    },

    async listTransactionsForMonth(userId, month) {
      const { startsOn, endsOn } = monthRange(month);
      return listTransactionsForDateRange(userId, startsOn, endsOn);
    },

    listTransactionsForDateRange,

    async findTransaction(userId, transactionId) {
      return findTransaction(userId, transactionId);
    },

    async createPendingTransaction({ userId, source, clientRequestId, values, confidence }) {
      const inserted = await client
        .from("transactions")
        .insert({
          user_id: userId,
          client_request_id: clientRequestId,
          source_type: source,
          review_status: "pending",
          ai_confidence: confidence,
          ...transactionUpdate(values),
        })
        .select(TRANSACTION_COLUMNS)
        .single();
      if (!inserted.error) return toTransaction(inserted.data as unknown as ExactTransactionRow);
      if (inserted.error.code !== "23505") fail(inserted.error);
      // The same WhatsApp message delivered twice: return what the first delivery saved.
      const existing = await client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("user_id", userId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      return toTransaction(existing.data as unknown as ExactTransactionRow);
    },

    async createTransaction({ userId, source, values }) {
      const inserted = await client
        .from("transactions")
        .insert({
          user_id: userId,
          client_request_id: values.clientRequestId,
          source_type: source,
          review_status: "confirmed",
          ...transactionUpdate(values),
        })
        .select(TRANSACTION_COLUMNS)
        .single();
      if (!inserted.error) return toTransaction(inserted.data as unknown as ExactTransactionRow);
      if (inserted.error.code !== "23505") fail(inserted.error);

      const existing = await client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("user_id", userId)
        .eq("client_request_id", values.clientRequestId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      const transaction = toTransaction(existing.data as unknown as ExactTransactionRow);
      const expected = JSON.stringify(transactionUpdate(values));
      const actual = JSON.stringify(
        transactionUpdate({
          kind: transaction.kind,
          merchantName: transaction.merchantName,
          money: transaction.money,
          occurredOn: transaction.occurredOn,
          occurredTime: transaction.occurredTime,
          description: transaction.description,
          location: transaction.location,
          accountHint: transaction.accountHint,
          categoryId: transaction.categoryId,
          financialAccountId: transaction.financialAccountId,
        }),
      );
      if (actual !== expected) {
        throw new FinanceOperationError("CONFLICT", "That request ID was already used.");
      }
      return transaction;
    },

    async replaceTransaction(input) {
      const result = await client
        .from("transactions")
        .update({ ...transactionUpdate(input.values), review_status: input.reviewStatus })
        .eq("id", input.transactionId)
        .eq("user_id", input.userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(TRANSACTION_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) {
        return missingOrConflict(client, "transactions", input.transactionId, input.userId);
      }
      return toTransaction(result.data as unknown as ExactTransactionRow);
    },

    async softDeleteTransaction(input) {
      const result = await client
        .from("transactions")
        .update({ deleted_at: input.deletedAt })
        .eq("id", input.transactionId)
        .eq("user_id", input.userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(TRANSACTION_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) {
        return missingOrConflict(client, "transactions", input.transactionId, input.userId);
      }
      return toTransaction(result.data as unknown as ExactTransactionRow);
    },

    async listFinancialAccounts(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("financial_accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit);
      if (input.isActive !== undefined) query = query.eq("is_active", input.isActive);
      const result = await query;
      if (result.error) fail(result.error);
      return page(result.data.map(toAccount), offset, limit);
    },

    async createFinancialAccount(userId, input) {
      const inserted = await client
        .from("financial_accounts")
        .insert({
          user_id: userId,
          client_request_id: input.clientRequestId,
          name: input.name,
          institution: input.institution,
          account_type: input.accountType,
          currency: input.currency,
          last_four: input.lastFour,
          institution_key: input.institutionKey,
          gmail_connection_id: input.gmailConnectionId,
        })
        .select(ACCOUNT_COLUMNS)
        .single();
      if (!inserted.error) return toAccount(inserted.data);
      if (inserted.error.code !== "23505") fail(inserted.error);

      const existing = await client
        .from("financial_accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("user_id", userId)
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      const financialAccount = toAccount(existing.data);
      if (
        financialAccount.name !== input.name ||
        financialAccount.institution !== input.institution ||
        financialAccount.accountType !== input.accountType ||
        financialAccount.currency !== input.currency ||
        financialAccount.lastFour !== input.lastFour ||
        financialAccount.institutionKey !== input.institutionKey ||
        financialAccount.gmailConnectionId !== input.gmailConnectionId
      ) {
        throw new FinanceOperationError("CONFLICT", "That request ID was already used.");
      }
      return financialAccount;
    },

    async updateFinancialAccount(userId, input) {
      const changes = {
        ...(input.changes.name === undefined ? {} : { name: input.changes.name }),
        ...(input.changes.institution === undefined
          ? {}
          : { institution: input.changes.institution }),
        ...(input.changes.accountType === undefined
          ? {}
          : { account_type: input.changes.accountType }),
        ...(input.changes.currency === undefined ? {} : { currency: input.changes.currency }),
        ...(input.changes.lastFour === undefined ? {} : { last_four: input.changes.lastFour }),
        ...(input.changes.institutionKey === undefined
          ? {}
          : { institution_key: input.changes.institutionKey }),
        ...(input.changes.gmailConnectionId === undefined
          ? {}
          : { gmail_connection_id: input.changes.gmailConnectionId }),
        ...(input.changes.isActive === undefined ? {} : { is_active: input.changes.isActive }),
      };
      const result = await client
        .from("financial_accounts")
        .update(changes)
        .eq("id", input.financialAccountId)
        .eq("user_id", userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .select(ACCOUNT_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) {
        return missingOrConflict(client, "financial_accounts", input.financialAccountId, userId);
      }
      return toAccount(result.data);
    },

    async listFinancialGoals(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("financial_goals")
        .select(FINANCIAL_GOAL_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("target_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit);
      if (input.status) query = query.eq("status", input.status);
      const result = await query;
      if (result.error) fail(result.error);
      return page(
        (result.data as unknown as ExactFinancialGoalRow[]).map(toFinancialGoal),
        offset,
        limit,
      );
    },

    async findFinancialGoal(userId, goalId) {
      return findFinancialGoal(userId, goalId);
    },

    async createFinancialGoal(userId, input) {
      const inserted = await client
        .from("financial_goals")
        .insert({
          user_id: userId,
          client_request_id: input.clientRequestId,
          name: input.name,
          target_amount: databaseNumeric(input.target.amountMinor),
          saved_amount: databaseNumeric(input.saved.amountMinor),
          currency: input.target.currency,
          target_date: input.targetDate,
        })
        .select(FINANCIAL_GOAL_COLUMNS)
        .single();
      if (!inserted.error)
        return toFinancialGoal(inserted.data as unknown as ExactFinancialGoalRow);
      if (inserted.error.code !== "23505") fail(inserted.error);
      const existing = await client
        .from("financial_goals")
        .select(FINANCIAL_GOAL_COLUMNS)
        .eq("user_id", userId)
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      const goal = toFinancialGoal(existing.data as unknown as ExactFinancialGoalRow);
      if (
        goal.name !== input.name ||
        goal.target.amountMinor !== input.target.amountMinor ||
        goal.saved.amountMinor !== input.saved.amountMinor ||
        goal.targetDate !== input.targetDate
      ) {
        throw new FinanceOperationError("CONFLICT", "That request ID was already used.");
      }
      return goal;
    },

    async updateFinancialGoal(userId, input) {
      const result = await client
        .from("financial_goals")
        .update({
          ...(input.changes.name === undefined ? {} : { name: input.changes.name }),
          ...(input.changes.target === undefined
            ? {}
            : {
                target_amount: databaseNumeric(input.changes.target.amountMinor),
                currency: input.changes.target.currency,
              }),
          ...(input.changes.saved === undefined
            ? {}
            : { saved_amount: databaseNumeric(input.changes.saved.amountMinor) }),
          ...(input.changes.targetDate === undefined
            ? {}
            : { target_date: input.changes.targetDate }),
        })
        .eq("id", input.goalId)
        .eq("user_id", userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(FINANCIAL_GOAL_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) return missingOrConflict(client, "financial_goals", input.goalId, userId);
      return toFinancialGoal(result.data as unknown as ExactFinancialGoalRow);
    },

    async setFinancialGoalImage(input) {
      const result = await client
        .from("financial_goals")
        .update({ image_path: input.imagePath })
        .eq("id", input.goalId)
        .eq("user_id", input.userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(FINANCIAL_GOAL_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data)
        return missingOrConflict(client, "financial_goals", input.goalId, input.userId);
      return toFinancialGoal(result.data as unknown as ExactFinancialGoalRow);
    },

    async softDeleteFinancialGoal(input) {
      const result = await client
        .from("financial_goals")
        .update({ deleted_at: input.deletedAt })
        .eq("id", input.goalId)
        .eq("user_id", input.userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(FINANCIAL_GOAL_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data)
        return missingOrConflict(client, "financial_goals", input.goalId, input.userId);
      return toFinancialGoal(result.data as unknown as ExactFinancialGoalRow);
    },

    async listCategories(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit);
      if (input.isArchived !== undefined) query = query.eq("is_archived", input.isArchived);
      const result = await query;
      if (result.error) fail(result.error);
      return page(result.data.map(toCategory), offset, limit);
    },

    async listAllCategories(userId) {
      return readAllPages(async (offset, limit) => {
        const result = await client
          .from("categories")
          .select(CATEGORY_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (result.error) fail(result.error);
        return result.data.map(toCategory);
      });
    },

    async createCategory(userId, input) {
      const id = input.clientRequestId.toLowerCase();
      const slug = `custom-${id}`;
      const inserted = await client
        .from("categories")
        .insert({
          id,
          user_id: userId,
          name: input.name,
          slug,
          icon: input.icon,
          color: input.color,
          is_default: false,
          is_archived: false,
        })
        .select(CATEGORY_COLUMNS)
        .single();
      if (!inserted.error) return toCategory(inserted.data);
      if (inserted.error.code !== "23505") fail(inserted.error);

      // The lookup stays owner-scoped even when a caller reuses another user's ID.
      const existing = await client
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      const category = toCategory(existing.data);
      if (
        category.name !== input.name ||
        category.icon !== input.icon ||
        category.color !== input.color ||
        category.slug !== slug ||
        category.isDefault ||
        category.isArchived
      ) {
        throw new FinanceOperationError("CONFLICT", "That request ID was already used.");
      }
      return category;
    },

    async updateCategory(userId, input) {
      const result = await client
        .from("categories")
        .update({
          ...(input.changes.name === undefined ? {} : { name: input.changes.name }),
          ...(input.changes.icon === undefined ? {} : { icon: input.changes.icon }),
          ...(input.changes.color === undefined ? {} : { color: input.changes.color }),
          ...(input.changes.isArchived === undefined
            ? {}
            : { is_archived: input.changes.isArchived }),
        })
        .eq("id", input.categoryId)
        .eq("user_id", userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .select(CATEGORY_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) return missingOrConflict(client, "categories", input.categoryId, userId);
      return toCategory(result.data);
    },

    async listBudgets(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("budgets")
        .select(BUDGET_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit);
      if (input.cadence) query = query.eq("cadence", input.cadence);
      if (input.isActive !== undefined) query = query.eq("is_active", input.isActive);
      const result = await query;
      if (result.error) fail(result.error);
      return page((result.data as unknown as ExactBudgetRow[]).map(toBudget), offset, limit);
    },

    async listAllBudgets(userId) {
      return readAllPages(async (offset, limit) => {
        const result = await client
          .from("budgets")
          .select(BUDGET_COLUMNS)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (result.error) fail(result.error);
        return (result.data as unknown as ExactBudgetRow[]).map(toBudget);
      });
    },

    async findBudget(userId, budgetId) {
      return findBudget(userId, budgetId);
    },

    async createBudget(userId, input) {
      const inserted = await client
        .from("budgets")
        .insert({
          user_id: userId,
          category_id: input.categoryId,
          client_request_id: input.clientRequestId,
          name: input.name,
          cadence: input.cadence,
          limit_amount: databaseNumeric(input.limit.amountMinor),
          currency: input.limit.currency,
          warning_percent: input.warningPercent,
          starts_on: input.startsOn,
        })
        .select(BUDGET_COLUMNS)
        .single();
      if (!inserted.error) return toBudget(inserted.data as unknown as ExactBudgetRow);
      if (inserted.error.code !== "23505") fail(inserted.error);

      const existing = await client
        .from("budgets")
        .select(BUDGET_COLUMNS)
        .eq("user_id", userId)
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(inserted.error);
      const budget = toBudget(existing.data as unknown as ExactBudgetRow);
      if (
        budget.categoryId !== input.categoryId ||
        budget.name !== input.name ||
        budget.cadence !== input.cadence ||
        budget.limit.amountMinor !== input.limit.amountMinor ||
        budget.limit.currency !== input.limit.currency ||
        budget.warningPercent !== input.warningPercent ||
        budget.startsOn !== input.startsOn
      ) {
        throw new FinanceOperationError("CONFLICT", "That request ID was already used.");
      }
      return budget;
    },

    async updateBudget(userId, input) {
      const result = await client
        .from("budgets")
        .update({
          ...(input.changes.categoryId === undefined
            ? {}
            : { category_id: input.changes.categoryId }),
          ...(input.changes.name === undefined ? {} : { name: input.changes.name }),
          ...(input.changes.cadence === undefined ? {} : { cadence: input.changes.cadence }),
          ...(input.changes.limit === undefined
            ? {}
            : {
                limit_amount: databaseNumeric(input.changes.limit.amountMinor),
                currency: input.changes.limit.currency,
              }),
          ...(input.changes.warningPercent === undefined
            ? {}
            : { warning_percent: input.changes.warningPercent }),
          ...(input.changes.startsOn === undefined ? {} : { starts_on: input.changes.startsOn }),
          ...(input.changes.isActive === undefined ? {} : { is_active: input.changes.isActive }),
        })
        .eq("id", input.budgetId)
        .eq("user_id", userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(BUDGET_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) return missingOrConflict(client, "budgets", input.budgetId, userId);
      return toBudget(result.data as unknown as ExactBudgetRow);
    },

    async softDeleteBudget(input) {
      const result = await client
        .from("budgets")
        .update({ deleted_at: input.deletedAt })
        .eq("id", input.budgetId)
        .eq("user_id", input.userId)
        .eq("updated_at", input.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(BUDGET_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) return missingOrConflict(client, "budgets", input.budgetId, input.userId);
      return toBudget(result.data as unknown as ExactBudgetRow);
    },

    async listUnreadReminders(userId, limit) {
      const result = await client
        .from("reminders")
        .select(REMINDER_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "unread")
        .order("scheduled_for", { ascending: true })
        .limit(limit);
      if (result.error) fail(result.error);
      return result.data.map(toReminder);
    },

    async listReminders(userId, input) {
      const offset = offsetFor(input.cursor);
      const limit = input.limit ?? 50;
      let query = client
        .from("reminders")
        .select(REMINDER_COLUMNS)
        .eq("user_id", userId)
        .order("scheduled_for", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit);
      if (input.status) query = query.eq("status", input.status);
      if (input.kind) query = query.eq("kind", input.kind);
      const result = await query;
      if (result.error) fail(result.error);
      return page(result.data.map(toReminder), offset, limit);
    },

    async findReminder(userId, reminderId) {
      const result = await client
        .from("reminders")
        .select(REMINDER_COLUMNS)
        .eq("user_id", userId)
        .eq("id", reminderId)
        .maybeSingle();
      if (result.error) fail(result.error);
      return result.data ? toReminder(result.data) : null;
    },

    async updateReminder(input) {
      const result = await client
        .from("reminders")
        .update({ status: input.status, read_at: input.readAt })
        .eq("user_id", input.userId)
        .eq("id", input.reminderId)
        .eq("status", input.expectedStatus)
        .select(REMINDER_COLUMNS)
        .maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) {
        throw new FinanceOperationError(
          "CONFLICT",
          "This notification changed. Refresh it and try again.",
        );
      }
      return toReminder(result.data);
    },

    async createBudgetThresholdReminder(input) {
      const result = await client
        .from("reminders")
        .insert({
          user_id: input.userId,
          budget_id: input.budget.id,
          kind: "budget_threshold",
          dedupe_key: input.dedupeKey,
          period_starts_on: input.periodStartsOn,
          threshold_percent: input.thresholdPercent,
          title: `${input.budget.name} Budget`,
          message: `${input.budget.name} reached ${input.thresholdPercent}%: IDR ${input.usage.amountMinor} of IDR ${input.budget.limit.amountMinor}.`,
          scheduled_for: input.scheduledFor,
        })
        .select("id")
        .single();
      // Already reminded for this threshold and period.
      if (result.error?.code === "23505") return null;
      if (result.error) fail(result.error);
      return result.data.id;
    },

    async createDestructiveConfirmation(input) {
      const log = await client
        .from("agent_action_logs")
        .insert({
          user_id: input.userId,
          channel: input.channel,
          event_type: "tool_call",
          tool_name: input.action,
          permission_tier: "T2",
          result_status: "awaiting_confirmation",
          resource_type: input.resourceType,
          resource_id: input.resourceId,
          request_fingerprint: input.requestFingerprint,
          confirmation_expires_at: input.expiresAt,
          created_at: input.createdAt,
        })
        .select("id")
        .single();
      if (log.error) fail(log.error);
      const confirmationId = log.data.id;
      const state = await client.from("agent_action_states").insert({
        action_id: confirmationId,
        user_id: input.userId,
        purpose: "confirmation",
        operation_state:
          input.state as unknown as Database["public"]["Tables"]["agent_action_states"]["Insert"]["operation_state"],
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      });
      if (state.error) {
        await client
          .from("agent_action_logs")
          .update({ result_status: "failed" })
          .eq("id", confirmationId)
          .eq("user_id", input.userId);
        fail(state.error);
      }
      return confirmationId;
    },

    async findDestructiveConfirmation(userId, confirmationId) {
      const result = await client
        .from("agent_action_states")
        .select("operation_state, expires_at, consumed_at")
        .eq("action_id", confirmationId)
        .eq("user_id", userId)
        .eq("purpose", "confirmation")
        .maybeSingle();
      if (result.error) fail(result.error);
      return result.data
        ? {
            state: result.data.operation_state,
            expiresAt: result.data.expires_at,
            consumedAt: result.data.consumed_at,
          }
        : null;
    },

    async consumeDestructiveConfirmation(input) {
      const state = await client
        .from("agent_action_states")
        .update({ consumed_at: input.consumedAt })
        .eq("action_id", input.confirmationId)
        .eq("user_id", input.userId)
        .eq("purpose", "confirmation")
        .is("consumed_at", null)
        .gt("expires_at", input.consumedAt)
        .select("action_id")
        .maybeSingle();
      if (state.error) fail(state.error);
      if (!state.data) return false;

      const log = await client
        .from("agent_action_logs")
        .update({ result_status: "succeeded" })
        .eq("id", input.confirmationId)
        .eq("user_id", input.userId)
        .eq("result_status", "awaiting_confirmation")
        .select("id")
        .maybeSingle();
      if (log.error) fail(log.error);
      if (!log.data) {
        throw new FinanceOperationError("INTERNAL", "The confirmation audit could not be updated.");
      }
      return true;
    },

    async findUndoAction(userId, actionId) {
      const state = await client
        .from("agent_action_states")
        .select("operation_state, expires_at, consumed_at")
        .eq("action_id", actionId)
        .eq("user_id", userId)
        .eq("purpose", "undo")
        .maybeSingle();
      if (state.error) fail(state.error);
      if (!state.data) return null;
      const log = await client
        .from("agent_action_logs")
        .select("resource_type, resource_id")
        .eq("id", actionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (log.error) fail(log.error);
      if (!log.data?.resource_type || !log.data.resource_id) return null;
      return {
        state: state.data.operation_state,
        resourceType: log.data.resource_type,
        resourceId: log.data.resource_id,
        expiresAt: state.data.expires_at,
        consumedAt: state.data.consumed_at,
      };
    },

    async consumeUndoAction(input) {
      const state = await client
        .from("agent_action_states")
        .update({ consumed_at: input.consumedAt })
        .eq("action_id", input.actionId)
        .eq("user_id", input.userId)
        .eq("purpose", "undo")
        .is("consumed_at", null)
        .gt("expires_at", input.consumedAt)
        .select("action_id")
        .maybeSingle();
      if (state.error) fail(state.error);
      return Boolean(state.data);
    },

    async recordUndoAction(input) {
      const log = await client
        .from("agent_action_logs")
        .insert({
          user_id: input.userId,
          channel: input.channel,
          event_type: "tool_call",
          tool_name: input.toolName,
          permission_tier: "T1",
          result_status: "succeeded",
          resource_type: input.resourceType,
          resource_id: input.resourceId,
          undo_expires_at: input.undoExpiresAt,
          created_at: input.changedAt,
        })
        .select("id")
        .single();
      if (log.error) fail(log.error);
      const actionId = log.data.id;
      const state = await client.from("agent_action_states").insert({
        action_id: actionId,
        user_id: input.userId,
        purpose: "undo",
        operation_state:
          input.state as unknown as Database["public"]["Tables"]["agent_action_states"]["Insert"]["operation_state"],
        expires_at: input.undoExpiresAt,
        created_at: input.changedAt,
      });
      if (state.error) fail(state.error);
      return {
        actionId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        changedAt: input.changedAt,
        undoExpiresAt: input.undoExpiresAt,
      };
    },
  };
}

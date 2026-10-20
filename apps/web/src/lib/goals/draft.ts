import {
  type CreateFinancialGoalInput,
  calendarDateSchema,
  createFinancialGoalInputSchema,
  type FinancialGoal,
  type UpdateFinancialGoalInput,
  updateFinancialGoalInputSchema,
} from "@monara/contracts";
import { FinanceClientError } from "../finance/client.ts";
import { parseDraftAmount } from "../finance/presentation.ts";

export type GoalDraft = {
  name: string;
  target: string;
  saved: string;
  targetDate: string;
  image: File | null;
};
export type GoalSaveRequest =
  | { operation: "create_financial_goal"; input: CreateFinancialGoalInput }
  | { operation: "edit_financial_goal"; input: UpdateFinancialGoalInput };
export type GoalDraftSession = {
  original: FinancialGoal | null;
  initial: GoalDraft;
  draft: GoalDraft;
  request: GoalSaveRequest | null;
  /** Once fields are saved, further retries may only upload the photo to this exact version. */
  savedGoal: FinancialGoal | null;
  pending: boolean;
  uncertain: boolean;
  error: string | null;
};

export function goalDraftOf(goal: FinancialGoal): GoalDraft {
  return {
    name: goal.name,
    target: goal.target.amountMinor,
    saved: goal.saved.amountMinor,
    targetDate: goal.targetDate,
    image: null,
  };
}

export function newGoalSession(goal: FinancialGoal | null, today: string): GoalDraftSession {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const draft = goal
    ? goalDraftOf(goal)
    : {
        name: "",
        target: "",
        saved: "0",
        targetDate: date.toISOString().slice(0, 10),
        image: null,
      };
  return {
    original: goal,
    initial: draft,
    draft,
    request: null,
    savedGoal: null,
    pending: false,
    uncertain: false,
    error: null,
  };
}

export function isGoalDraftDirty(session: GoalDraftSession): boolean {
  return (Object.keys(session.draft) as (keyof GoalDraft)[]).some(
    (key) => session.draft[key] !== session.initial[key],
  );
}

export function goalEditorAvailability(
  session: GoalDraftSession,
  latest: FinancialGoal | undefined,
  refreshRequired: boolean,
) {
  const base = session.savedGoal ?? session.original;
  const changed = Boolean(base && latest && base.updatedAt !== latest.updatedAt);
  const unavailable = Boolean(base && !latest);
  const blocked = session.pending || refreshRequired || changed || unavailable;
  return {
    changed,
    unavailable,
    blocked,
    locked: blocked || session.uncertain || Boolean(session.savedGoal),
  };
}

/** Form preflight never dispatches a write or turns missing input into an uncertain save. */
export function validateGoalDraft(draft: GoalDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  let target: number | null = null;
  let saved: number | null = null;
  try {
    target = parseDraftAmount(draft.target);
  } catch {
    errors.target = "Enter a positive whole target amount.";
  }
  try {
    saved = parseDraftAmount(draft.saved);
  } catch {
    errors.saved = "Enter a whole amount already saved.";
  }
  if (!draft.name.trim() || draft.name.trim().length > 100)
    errors.name = "Add a goal name, up to 100 characters.";
  if (target === null || target <= 0) errors.target = "Enter a positive target.";
  if (saved === null || saved < 0) errors.saved = "Enter the amount already saved.";
  if (target !== null && saved !== null && saved > target)
    errors.saved = "Saved cannot exceed the target.";
  if (!calendarDateSchema.safeParse(draft.targetDate).success)
    errors.targetDate = "Choose a valid target date.";
  if (
    draft.image &&
    (draft.image.size > 3 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(draft.image.type))
  )
    errors.image = "Choose a JPEG, PNG, or WebP under 3 MB.";
  return errors;
}

export function goalHasDraftSettings(goal: FinancialGoal, draft: GoalDraft): boolean {
  if (!/^\d+$/.test(draft.target.trim()) || !/^\d+$/.test(draft.saved.trim())) return false;
  return (
    goal.name === draft.name.trim() &&
    goal.target.amountMinor === BigInt(draft.target.trim()).toString() &&
    goal.saved.amountMinor === BigInt(draft.saved.trim()).toString() &&
    goal.targetDate === draft.targetDate
  );
}

export function prepareGoalRequest(session: GoalDraftSession): GoalSaveRequest {
  const { draft, original } = session;
  const values = {
    name: draft.name,
    target: { amountMinor: String(parseDraftAmount(draft.target) ?? 0), currency: "IDR" },
    saved: { amountMinor: String(parseDraftAmount(draft.saved) ?? 0), currency: "IDR" },
    targetDate: draft.targetDate,
  };
  return original
    ? {
        operation: "edit_financial_goal",
        input: updateFinancialGoalInputSchema.parse({
          goalId: original.id,
          expectedUpdatedAt: original.updatedAt,
          changes: values,
        }),
      }
    : {
        operation: "create_financial_goal",
        input: createFinancialGoalInputSchema.parse({
          ...values,
          clientRequestId: crypto.randomUUID(),
        }),
      };
}

/** Keep a failed request immutable, including its UUID and the version used for an image retry. */
export async function executeGoalSave(
  session: GoalDraftSession,
  dependencies: {
    saveFields: (request: GoalSaveRequest) => Promise<FinancialGoal>;
    savePhoto: (goal: FinancialGoal, image: File) => Promise<FinancialGoal>;
    keep: (session: GoalDraftSession) => void;
  },
): Promise<FinancialGoal | null> {
  let current = session;
  const keep = (patch: Partial<GoalDraftSession>) => {
    current = { ...current, ...patch };
    dependencies.keep(current);
  };
  try {
    const request = current.request ?? prepareGoalRequest(current);
    keep({ request, pending: true, error: null });
    let savedGoal = current.savedGoal;
    if (!savedGoal) {
      savedGoal = await dependencies.saveFields(request);
      if (savedGoal.deletedAt)
        throw new FinanceClientError(
          "NOT_FOUND",
          "That goal was removed. Your draft is kept. Check your goals before starting another.",
          null,
        );
      keep({ savedGoal, uncertain: false });
    }
    if (current.draft.image) {
      savedGoal = await dependencies.savePhoto(savedGoal, current.draft.image);
      keep({ savedGoal, uncertain: false });
    }
    keep({ pending: false, uncertain: false, error: null });
    return savedGoal;
  } catch (error) {
    const known = error instanceof FinanceClientError;
    const dispatched = current.request !== null || current.savedGoal !== null;
    const uncertain =
      dispatched &&
      (current.uncertain ||
        !known ||
        error.actionMayHaveCompleted ||
        error.code === "CONFLICT" ||
        error.code === "NOT_FOUND");
    keep({
      pending: false,
      uncertain,
      request: uncertain || current.savedGoal ? current.request : null,
      error: !dispatched
        ? "Check the goal details. Your draft is kept and nothing was sent."
        : current.savedGoal
          ? "Your goal is saved. The photo hasn’t been confirmed. Refresh your records, then retry the photo if needed."
          : known
            ? error.message
            : "The save couldn’t be checked. Your goal draft is kept. Refresh before retrying the same change.",
    });
    return null;
  }
}

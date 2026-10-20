import type { FinancialGoal } from "@monara/contracts";
import { callFinanceOperation } from "../finance/client.ts";
import { uploadGoalImage } from "./client.ts";
import type { GoalSaveRequest } from "./draft.ts";

export type GoalRunMutation = <Result>(operation: () => Promise<Result>) => Promise<Result>;

/** Adapts the same recoverable workflow to authenticated operations or explicit demo memory. */
export function goalSaveOperations(input: {
  demo: boolean;
  original: FinancialGoal | null;
  today: string;
  runMutation?: GoalRunMutation;
  updateDemo: (update: (goals: FinancialGoal[]) => FinancialGoal[]) => void;
  updateImages: (update: (images: Record<string, string>) => Record<string, string>) => void;
}) {
  return {
    async saveFields(request: GoalSaveRequest): Promise<FinancialGoal> {
      if (!input.demo) {
        const mutate = input.runMutation;
        if (!mutate) throw new Error("Goals are unavailable.");
        return mutate(() =>
          request.operation === "create_financial_goal"
            ? callFinanceOperation(request.operation, request.input)
            : callFinanceOperation(request.operation, request.input),
        );
      }
      const values =
        request.operation === "create_financial_goal" ? request.input : request.input.changes;
      const base = input.original;
      const target = values.target ?? base?.target;
      const saved = values.saved ?? base?.saved;
      if (!target || !saved) throw new Error("Check the goal amounts.");
      const id =
        request.operation === "create_financial_goal"
          ? request.input.clientRequestId
          : request.input.goalId;
      const item: FinancialGoal = {
        id,
        name: values.name?.trim() ?? base?.name ?? "",
        target,
        saved,
        targetDate: values.targetDate ?? base?.targetDate ?? input.today,
        status: target.amountMinor === saved.amountMinor ? "completed" : "active",
        imagePath: base?.imagePath ?? null,
        deletedAt: null,
        createdAt: base?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      input.updateDemo((items) => [...items.filter((goal) => goal.id !== id), item]);
      return item;
    },
    async savePhoto(goal: FinancialGoal, image: File): Promise<FinancialGoal> {
      if (!input.demo) {
        const mutate = input.runMutation;
        if (!mutate) throw new Error("Goals are unavailable.");
        return mutate(() => uploadGoalImage(goal, image));
      }
      const localImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
        reader.addEventListener(
          "error",
          () => reject(new Error("The image preview could not be loaded.")),
          { once: true },
        );
        reader.readAsDataURL(image);
      });
      input.updateImages((images) => ({ ...images, [goal.id]: localImage }));
      return goal;
    },
  };
}

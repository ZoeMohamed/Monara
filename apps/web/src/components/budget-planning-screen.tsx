"use client";

import { Button } from "@monara/ui";
import { type ReactNode, useState } from "react";

export function BudgetPlanningScreen({ budgets, goals }: { budgets: ReactNode; goals: ReactNode }) {
  const [view, setView] = useState<"budgets" | "goals">("budgets");
  return (
    <div className="min-w-0">
      <nav
        aria-label="Planning views"
        className="mb-4 grid grid-cols-2 rounded-xl bg-surface-secondary p-1"
      >
        <Button
          aria-pressed={view === "budgets"}
          className="min-h-10 rounded-lg"
          onPress={() => setView("budgets")}
          variant={view === "budgets" ? "secondary" : "ghost"}
        >
          Budgets
        </Button>
        <Button
          aria-pressed={view === "goals"}
          className="min-h-10 rounded-lg"
          onPress={() => setView("goals")}
          variant={view === "goals" ? "secondary" : "ghost"}
        >
          Goals
        </Button>
      </nav>
      {view === "budgets" ? (
        budgets
      ) : (
        <div>
          <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">Goals</h1>
          {goals}
        </div>
      )}
    </div>
  );
}

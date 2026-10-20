"use client";

import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { Icon } from "@/components/icon";

type PlanningView = "budgets" | "goals";

function planningViewForKey(view: PlanningView, key: string): PlanningView | null {
  if (key === "Home") return "budgets";
  if (key === "End") return "goals";
  if (key === "ArrowLeft" || key === "ArrowRight") return view === "budgets" ? "goals" : "budgets";
  return null;
}

export function BudgetPlanningScreen({ budgets, goals }: { budgets: ReactNode; goals: ReactNode }) {
  const [view, setView] = useState<PlanningView>("budgets");
  const id = useId();
  const activateWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = planningViewForKey(view, event.key);
    if (!next) return;
    event.preventDefault();
    setView(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-planning-view="${next}"]`)
      ?.focus();
  };
  return (
    <div className="min-w-0">
      <div
        aria-label="Planning"
        className="mb-6 grid grid-cols-2 border-b border-border"
        role="tablist"
      >
        {(["budgets", "goals"] as const).map((item) => (
          <button
            aria-controls={`${id}-${item}-panel`}
            aria-selected={view === item}
            className={`flex min-h-12 items-center justify-center gap-2 border-b-[3px] px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset ${view === item ? "border-accent text-accent" : "border-transparent text-muted hover:bg-surface-secondary hover:text-foreground"}`}
            data-planning-view={item}
            id={`${id}-${item}-tab`}
            key={item}
            onClick={() => setView(item)}
            onKeyDown={activateWithKeyboard}
            role="tab"
            tabIndex={view === item ? 0 : -1}
            type="button"
          >
            <Icon className="h-4 w-4" name={item === "budgets" ? "budgets" : "sparkle"} />
            {item === "budgets" ? "Budgets" : "Goals"}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-budgets-tab`}
        hidden={view !== "budgets"}
        id={`${id}-budgets-panel`}
        role="tabpanel"
      >
        {view === "budgets" ? budgets : null}
      </div>
      <div
        aria-labelledby={`${id}-goals-tab`}
        hidden={view !== "goals"}
        id={`${id}-goals-panel`}
        role="tabpanel"
      >
        {view === "goals" ? goals : null}
      </div>
    </div>
  );
}

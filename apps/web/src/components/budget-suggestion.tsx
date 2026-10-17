"use client";

import type { BudgetCadence, BudgetSuggestion } from "@monara/contracts";
import { Button } from "@monara/ui";
import { useEffect, useRef, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import { FinancePresentationError, safePresentationAmount } from "@/lib/finance/presentation";

function historyDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Key by category and cadence so a proposal can only fill the draft it was requested for. */
export function BudgetSuggestionPanel({
  categoryId,
  cadence,
  disabled,
  onAccept,
}: {
  categoryId: string;
  cadence: BudgetCadence;
  disabled: boolean;
  onAccept: (amount: string) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const [state, setState] = useState({
    pending: false,
    proposal: null as BudgetSuggestion | null,
    error: null as string | null,
  });
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const suggest = async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setState({ pending: true, proposal: null, error: null });
    try {
      const proposal = await callFinanceOperation("suggest_budget", { categoryId, cadence });
      if (proposal.categoryId !== categoryId || proposal.cadence !== cadence) {
        throw new FinanceClientError(
          "DEPENDENCY_UNAVAILABLE",
          "The suggestion did not match this budget. Please try again.",
          null,
        );
      }
      // Match the existing editor's exact-money boundary before offering acceptance.
      safePresentationAmount(proposal.proposedLimit.amountMinor);
      if (active.current) setState({ pending: false, proposal, error: null });
    } catch (error) {
      if (active.current)
        setState({
          pending: false,
          proposal: null,
          error:
            error instanceof FinanceClientError || error instanceof FinancePresentationError
              ? error.message
              : "A suggestion could not be loaded. Please try again.",
        });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <section
      aria-label="Budget suggestion"
      aria-busy={state.pending}
      className="grid gap-3 rounded-xl bg-surface-secondary p-3"
    >
      {state.proposal ? (
        <>
          <div role="status">
            <p className="text-xs text-muted">Suggested limit</p>
            <p className="text-lg font-bold tabular-nums [overflow-wrap:anywhere]" data-amount>
              {formatRupiah(BigInt(state.proposal.proposedLimit.amountMinor))}
              <span className="ml-1 text-xs font-medium text-muted">
                per {cadence === "weekly" ? "week" : "month"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              isDisabled={disabled}
              onPress={() => {
                if (!disabled && state.proposal) onAccept(state.proposal.proposedLimit.amountMinor);
              }}
              type="button"
              variant="secondary"
            >
              Use suggested limit
            </Button>
            <Button
              className="min-h-11"
              isDisabled={disabled}
              onPress={() => setState({ pending: false, proposal: null, error: null })}
              type="button"
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
          <details className="text-xs leading-5 text-muted">
            <summary className="min-h-11 cursor-pointer content-center rounded-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              How it’s calculated
            </summary>
            <p>
              {historyDate(state.proposal.basedOnStartsOn)} –{" "}
              {historyDate(state.proposal.basedOnEndsOn)}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <dt>Category spending</dt>
                <dd className="font-semibold text-foreground [overflow-wrap:anywhere]" data-amount>
                  {formatRupiah(BigInt(state.proposal.confirmedSpending.amountMinor))}
                </dd>
              </div>
              <div className="min-w-0">
                <dt>Total income</dt>
                <dd className="font-semibold text-foreground [overflow-wrap:anywhere]" data-amount>
                  {formatRupiah(BigInt(state.proposal.confirmedIncome.amountMinor))}
                </dd>
              </div>
            </dl>
            <p className="mt-2">
              {cadence === "monthly"
                ? "Category spending ÷ 3 months."
                : "Category spending × 7 ÷ history days."}{" "}
              Confirmed records only. Rounded to whole rupiah, minimum Rp1. Income is context; the
              limit uses spending.
            </p>
            <p className="mt-2">Your budget changes when you save.</p>
          </details>
        </>
      ) : (
        <Button
          className="min-h-11 justify-self-start"
          isDisabled={disabled || state.pending}
          onPress={suggest}
          type="button"
          variant="secondary"
        >
          {state.pending ? "Finding a limit…" : "Suggest a limit"}
        </Button>
      )}
      {state.error && (
        <p className="text-xs leading-5 text-danger" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import { type FinanceSnapshot, loadFinanceSnapshot } from "@/lib/finance/presentation";

export type MutationOptions<Result> = {
  shouldRefresh?: (result: Result) => boolean;
  refreshFailureMessage?: string;
  onRefreshFailure?: (result: Result, message: string) => Result;
};

/** Keeps one verified ledger snapshot and stops writes until an uncertain result is reconciled. */
export function useFinanceSync(initial: FinanceSnapshot | undefined, month: string, today: string) {
  const live = initial !== undefined;
  const [snapshot, setSnapshot] = useState(initial);
  const [loadState, setLoadState] = useState<"idle" | "loading">("idle");
  const pending = loadState === "loading";
  const [mutationPending, setMutationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<"verified" | "required">("verified");
  const needsRecovery = recoveryState === "required";
  const latest = useRef({ month, today });
  const generation = useRef(0);
  const latestRequest = useRef(0);
  const loading = useRef(false);
  const mutating = useRef(false);
  const recovery = useRef(false);
  const verifiedPeriod = useRef<{ month: string; today: string } | null>({
    month: initial?.month ?? month,
    today,
  });

  const refresh = useCallback(async () => {
    if (!live) return;
    const request = ++generation.current;
    latestRequest.current = request;
    const period = latest.current;
    loading.current = true;
    setLoadState("loading");
    try {
      const next = await loadFinanceSnapshot(callFinanceOperation, period.month, period.today);
      if (generation.current !== request) return;
      setSnapshot(next);
      verifiedPeriod.current = period;
      recovery.current = false;
      setRecoveryState("verified");
      setError(null);
    } catch (failure) {
      if (generation.current !== request) return;
      recovery.current = true;
      setRecoveryState("required");
      setError(failure instanceof Error ? failure.message : "Your records could not be loaded.");
      throw failure;
    } finally {
      // A period change may invalidate this result without starting another read
      // (for example, returning to the already verified month). That read still
      // owns its loading flag, but must never clear a newer read's flag.
      if (latestRequest.current === request) {
        loading.current = false;
        setLoadState("idle");
      }
    }
  }, [live]);

  useEffect(() => {
    latest.current = { month, today };
    if (
      live &&
      (month !== verifiedPeriod.current?.month || today !== verifiedPeriod.current?.today)
    ) {
      void refresh().catch(() => undefined);
    }
    return () => {
      generation.current += 1;
    };
  }, [live, month, today, refresh]);

  const runMutation = async <Result>(
    operation: () => Promise<Result>,
    options?: MutationOptions<Result>,
  ): Promise<Result> => {
    if (mutating.current)
      throw new FinanceClientError(
        "CONFLICT",
        "Your previous change is still saving. Give it a moment, then try again.",
        null,
      );
    if (loading.current || recovery.current || snapshot?.month !== month) {
      throw new FinanceClientError(
        "CONFLICT",
        "Refresh your records before making another change.",
        null,
      );
    }
    mutating.current = true;
    setMutationPending(true);
    let saved = false;
    try {
      const result = await operation();
      if (options?.shouldRefresh && !options.shouldRefresh(result)) return result;
      saved = true;
      // The snapshot predates this write. Returning to its month must still
      // reconcile the saved result, even if an intervening read was invalidated.
      verifiedPeriod.current = null;
      recovery.current = true;
      setRecoveryState("required");
      try {
        await refresh();
      } catch (failure) {
        // Chat keeps a verified reply/receipt even when its subsequent ledger read fails.
        if (options?.onRefreshFailure) {
          const message =
            options.refreshFailureMessage ??
            "Your change was saved. Refresh to load the updated records before making another change.";
          recovery.current = true;
          setRecoveryState("required");
          setError(message);
          return options.onRefreshFailure(result, message);
        }
        throw failure;
      }
      return result;
    } catch (failure) {
      const uncertain =
        saved || !(failure instanceof FinanceClientError) || failure.actionMayHaveCompleted;
      if (uncertain) {
        // Reads begun before an uncertain write cannot establish its outcome.
        // Invalidate them and require a new read, even in a previously seen month.
        generation.current += 1;
        verifiedPeriod.current = null;
        recovery.current = true;
        setRecoveryState("required");
        const message = saved
          ? (options?.refreshFailureMessage ??
            "Your change was saved. Refresh to load the updated records before making another change.")
          : failure instanceof FinanceClientError
            ? failure.message
            : "We couldn't verify whether your change was saved. Refresh your records to check before trying again.";
        setError(message);
        throw new FinanceClientError("DEPENDENCY_UNAVAILABLE", message, null, true);
      }
      throw failure;
    } finally {
      mutating.current = false;
      setMutationPending(false);
    }
  };

  return { snapshot, refresh, runMutation, mutationPending, pending, error, needsRecovery };
}

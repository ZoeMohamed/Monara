"use client";

import type { ForecastSummary } from "@monara/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Transaction } from "@/data/demo-ledger";
import { ForecastClientError, fetchForecast, refreshForecast } from "@/lib/forecast/client";
import { forecastNeedsRefresh } from "@/lib/forecast/due";

export type ForecastState =
  | { status: "loading" }
  | { status: "ready"; forecast: ForecastSummary | null }
  | { status: "failed"; message: string; forecast: ForecastSummary | null };

const messageOf = (error: unknown) =>
  error instanceof ForecastClientError ? error.message : "Try again.";

/** Read updated realization matches after ledger changes; generate only when missing or stale. */
export function useForecast(today: string, transactions?: Transaction[]) {
  const [state, setState] = useState<ForecastState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const attemptedDate = useRef<string | null>(null);
  const inFlight = useRef(false);

  const generate = useCallback(async (automatic = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setState({ status: "ready", forecast: await refreshForecast(undefined, automatic) });
    } catch (error) {
      setState((previous) => ({
        status: "failed",
        message: messageOf(error),
        forecast: previous.status === "loading" ? null : previous.forecast,
      }));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => generate(false), [generate]);

  useEffect(() => {
    let current = true;
    let read = 0;
    const load = () => {
      const request = ++read;
      void fetchForecast()
        .then((forecast) => {
          if (!current || request !== read || inFlight.current) return;
          setState({ status: "ready", forecast });
          if (attemptedDate.current !== today && forecastNeedsRefresh(forecast, today)) {
            attemptedDate.current = today;
            void generate(true);
          }
        })
        .catch((error: unknown) => {
          if (current && request === read && !inFlight.current) {
            setState((previous) => ({
              status: "failed",
              message: messageOf(error),
              forecast: previous.status === "loading" ? null : previous.forecast,
            }));
          }
        });
    };
    // Ledger changes re-read realization matches without forcing a model run.
    void transactions;
    load();
    const onFocus = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      current = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [today, transactions, generate]);

  return { state, refreshing, refresh };
}

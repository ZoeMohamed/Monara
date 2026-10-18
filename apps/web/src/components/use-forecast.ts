"use client";

import type { ForecastSummary } from "@monara/contracts";
import { useCallback, useEffect, useState } from "react";
import { ForecastClientError, fetchForecast, refreshForecast } from "@/lib/forecast/client";

export type ForecastState =
  | { status: "loading" }
  | { status: "ready"; forecast: ForecastSummary | null }
  | { status: "failed"; message: string; forecast: ForecastSummary | null };

const messageOf = (error: unknown) =>
  error instanceof ForecastClientError ? error.message : "Try again.";

/** Loads the signed-in User's forecast once and offers a manual refresh. */
export function useForecast() {
  const [state, setState] = useState<ForecastState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let current = true;
    fetchForecast()
      .then((forecast) => current && setState({ status: "ready", forecast }))
      .catch((error: unknown) => {
        if (current) setState({ status: "failed", message: messageOf(error), forecast: null });
      });
    return () => {
      current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setState({ status: "ready", forecast: await refreshForecast() });
    } catch (error) {
      setState((previous) => ({
        status: "failed",
        message: messageOf(error),
        forecast: previous.status === "loading" ? null : previous.forecast,
      }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { state, refreshing, refresh };
}

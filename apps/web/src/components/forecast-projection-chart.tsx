"use client";

import { useId } from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import type { Projection } from "@/lib/forecast/projection";
import styles from "./forecast-projection-chart.module.css";

const WIDTH = 300;
const HEIGHT = 168;
const LEFT = 14;
const RIGHT = 16;
const TOP = 34;
const BOTTOM = 24;

const points = (list: { x: number; y: number }[]) =>
  list.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

/**
 * This month's confirmed spending as a solid line, and the path the forecast expects to month end
 * as a dashed one. Both start from the same day, so the gap between them is what is still to come.
 */
export function ForecastProjectionChart({ projection }: { projection: Projection }) {
  const { formatRupiah, compactAmount } = useAmountDisplay();
  const gradient = useId();
  const x = (day: number) =>
    LEFT + ((day - 1) / Math.max(projection.lastDay - 1, 1)) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) =>
    HEIGHT - BOTTOM - (value / projection.maximum) * (HEIGHT - TOP - BOTTOM);
  const solid = projection.solid.map((point) => ({ x: x(point.day), y: y(point.value) }));
  const dashed = projection.dashed.map((point) => ({ x: x(point.day), y: y(point.value) }));
  const now = solid[solid.length - 1];
  const end = dashed[dashed.length - 1];
  if (!now || !end) return null;
  const baseline = HEIGHT - BOTTOM;
  const area = `${points(solid)} ${now.x.toFixed(1)},${baseline} ${solid[0]?.x.toFixed(1)},${baseline}`;
  const label = `Confirmed spending so far ${formatRupiah(projection.spentSoFar)}. Expected by the end of the month ${formatRupiah(projection.projected)}.`;

  return (
    <figure className={styles.figure}>
      <svg
        aria-label={label}
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.33, 0.66].map((fraction) => {
          const height = baseline - fraction * (HEIGHT - TOP - BOTTOM);
          return (
            <line
              className={styles.grid}
              key={fraction}
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={height}
              y2={height}
            />
          );
        })}
        <line
          className={styles.baseline}
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={baseline}
          y2={baseline}
        />
        <polygon fill={`url(#${gradient})`} points={area} />
        <polyline className={styles.expected} fill="none" points={points(dashed)} />
        <polyline className={styles.spent} fill="none" points={points(solid)} />
        <circle className={styles.now} cx={now.x} cy={now.y} r="3.4" />
        <circle className={styles.end} cx={end.x} cy={end.y} r="3" />
        <text
          className={styles.value}
          textAnchor="end"
          x={WIDTH - RIGHT}
          y={Math.max(end.y - 9, 12)}
          data-amount
        >
          {compactAmount(projection.projected, false)}
        </text>
        <text
          className={styles.soFar}
          data-amount
          textAnchor="middle"
          x={Math.min(Math.max(now.x, 30), WIDTH - 70)}
          y={now.y - 11}
        >
          {compactAmount(projection.spentSoFar, false)}
        </text>
        <text className={styles.axis} textAnchor="start" x={LEFT} y={HEIGHT - 6}>
          1
        </text>
        <text
          className={styles.axis}
          textAnchor="middle"
          x={Math.min(Math.max(now.x, 22), WIDTH - 26)}
          y={HEIGHT - 6}
        >
          Today
        </text>
        <text className={styles.axis} textAnchor="end" x={WIDTH - RIGHT} y={HEIGHT - 6}>
          {projection.lastDay}
        </text>
      </svg>
      <figcaption className={styles.legend}>
        <span data-kind="spent">Confirmed</span>
        <span data-kind="expected">Expected</span>
      </figcaption>
    </figure>
  );
}

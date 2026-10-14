"use client";

import { Card } from "@monara/ui";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";

import { TransactionRow } from "@/components/transaction-row";
import { SectionTitle } from "@/components/visual";
import { categoryColor } from "@/data/category-style";
import { formatRupiah, type Transaction } from "@/data/demo-ledger";
import { categoryKey, chartRatio } from "@/data/finance-analytics";
import { spendingFlow } from "@/data/spending-flow";

import styles from "./spending-flow.module.css";

type Flow = ReturnType<typeof spendingFlow>;
type Category = Flow["categories"][number];
type NodeStyle = CSSProperties & { "--flow-color": string };
type FlowAnchor = { left: number; right: number; center: number; height: number };
type FlowLayout = {
  height: number;
  source: FlowAnchor;
  categories: FlowAnchor[];
  merchants: FlowAnchor[];
};

function flowAnchor(element: HTMLElement, bounds: DOMRect): FlowAnchor {
  const node = element.getBoundingClientRect();
  const coordinate = (value: number) => Number(value.toFixed(3));
  return {
    left: coordinate(((node.left - bounds.left) / bounds.width) * 1000),
    right: coordinate(((node.right - bounds.left) / bounds.width) * 1000),
    center: coordinate(node.top - bounds.top + node.height / 2),
    height: coordinate(node.height),
  };
}

function measuredFlowLayout(chart: HTMLDivElement): FlowLayout | null {
  const bounds = chart.getBoundingClientRect();
  const source = chart.querySelector<HTMLElement>("[data-flow-source]");
  if (!source || bounds.width === 0 || bounds.height === 0) return null;
  const anchors = (selector: string) =>
    Array.from(chart.querySelectorAll<HTMLButtonElement>(selector), (node) =>
      flowAnchor(node, bounds),
    );
  return {
    height: Number(bounds.height.toFixed(3)),
    source: flowAnchor(source, bounds),
    categories: anchors("[data-flow-categories] button"),
    merchants: anchors("[data-flow-merchants] button"),
  };
}

function initialFlowLayout(flow: Flow, selected: Category): FlowLayout {
  const height = Math.max(flow.categories.length, selected.merchants.length) * 64 - 8;
  return {
    height,
    source: { left: 0, right: 210, center: height / 2, height: 72 },
    categories: flow.categories.map((_, index) => ({
      left: 305,
      right: 595,
      center: index * 64 + 28,
      height: 56,
    })),
    merchants: selected.merchants.map((_, index) => ({
      left: 690,
      right: 1000,
      center: index * 64 + 28,
      height: 56,
    })),
  };
}

function ribbon(start: number, end: number, top: number, center: number, thickness: number) {
  const bend = (start + end) / 2;
  return `M${start},${top} C${bend},${top} ${bend},${center - thickness / 2} ${end},${center - thickness / 2} L${end},${center + thickness / 2} C${bend},${center + thickness / 2} ${bend},${top + thickness} ${start},${top + thickness} Z`;
}

// Stacks ribbon thicknesses from a starting edge so each band leaves where the previous one ended.
function stacked(amounts: bigint[], total: bigint, available: number, start: number) {
  const thicknesses = amounts.map((amount) => chartRatio(amount, total) * available);
  return thicknesses.map((thickness, index) => ({
    thickness,
    top: start + thicknesses.slice(0, index).reduce((sum, value) => sum + value, 0),
  }));
}

function FlowRibbons({
  flow,
  selected,
  layout,
}: {
  flow: Flow;
  selected: Category;
  layout: FlowLayout | null;
}) {
  const geometry =
    layout &&
    layout.categories.length === flow.categories.length &&
    layout.merchants.length === selected.merchants.length
      ? layout
      : initialFlowLayout(flow, selected);
  const available = Math.max(0, Math.min(96, geometry.source.height - 16));
  const selectedIndex = flow.categories.indexOf(selected);
  const selectedColor = categoryColor(selected.name, selectedIndex);
  const categoryBands = stacked(
    flow.categories.map((category) => category.amount),
    flow.spending,
    available,
    geometry.source.center - available / 2,
  );
  const merchantBands = stacked(
    selected.merchants.map((merchant) => merchant.amount),
    flow.spending,
    available,
    geometry.categories[selectedIndex].center -
      (chartRatio(selected.amount, flow.spending) * available) / 2,
  );
  return (
    <svg
      aria-hidden="true"
      className={styles.ribbons}
      preserveAspectRatio="none"
      viewBox={`0 0 1000 ${geometry.height}`}
    >
      {flow.categories.map((category, index) => (
        <path
          className={styles.ribbon}
          d={ribbon(
            geometry.source.right,
            geometry.categories[index].left,
            categoryBands[index].top,
            geometry.categories[index].center,
            categoryBands[index].thickness,
          )}
          data-selected={category === selected}
          fill={categoryColor(category.name, index)}
          key={categoryKey(category)}
        />
      ))}
      {selected.merchants.map((merchant, index) => (
        <path
          className={styles.ribbon}
          d={ribbon(
            geometry.categories[selectedIndex].right,
            geometry.merchants[index].left,
            merchantBands[index].top,
            geometry.merchants[index].center,
            merchantBands[index].thickness,
          )}
          data-selected="true"
          fill={selectedColor}
          key={`${categoryKey(selected)}-${merchant.name}`}
        />
      ))}
    </svg>
  );
}

function NodeLabel({ name, amount, caption }: { name: string; amount: bigint; caption?: string }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold">{name}</span>
        {caption ? <span className="mt-0.5 block text-xs text-muted">{caption}</span> : null}
      </span>
      <span className="max-w-[49%] break-words text-right text-xs font-bold tabular-nums">
        {formatRupiah(amount)}
      </span>
    </>
  );
}

export function SpendingFlow({
  transactions,
  month,
  onOpenTransaction,
}: {
  transactions: Transaction[];
  month: string;
  onOpenTransaction?: (transaction: Transaction) => void;
}) {
  const [categorySelection, setCategorySelection] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [layout, setLayout] = useState<FlowLayout | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const placesId = useId();
  const flow = spendingFlow(transactions, month);
  const selected =
    flow.categories.find((category) => categoryKey(category) === categorySelection) ??
    flow.categories[0];
  const merchant = selected?.merchants.find((item) => item.name === merchantName);
  const nodeKey = JSON.stringify([
    flow.categories.map((category) => [categoryKey(category), category.name]),
    selected?.merchants.map((item) => item.name),
  ]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // The actual node boxes account for wrapped names, large amounts and late-loading fonts.
    const observer = new ResizeObserver(() => {
      if (!chart.isConnected || chart.dataset.flowKey !== nodeKey) return;
      const next = measuredFlowLayout(chart);
      if (!next) return;
      setLayout((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    });
    observer.observe(chart);
    for (const node of chart.querySelectorAll("[data-flow-source], fieldset button")) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [nodeKey]);
  return (
    <Card
      aria-labelledby={headingId}
      className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface p-4 sm:p-6"
    >
      <SectionTitle id={headingId} title="Follow the money" />
      {!selected ? (
        <p className="mt-4 text-sm text-muted">No confirmed expenses this month.</p>
      ) : (
        <>
          <div
            className="mt-5 grid grid-cols-[21%_29%_31%] justify-between text-xs font-semibold text-muted max-md:hidden"
            aria-hidden="true"
          >
            <span>Spending</span>
            <span>Categories</span>
            <span>Places</span>
          </div>
          <div className={`${styles.chart} mt-3`} data-flow-key={nodeKey} ref={chartRef}>
            <p aria-live="polite" className="sr-only">
              {selected.name}: {selected.merchants.length}{" "}
              {selected.merchants.length === 1 ? "place" : "places"},{" "}
              {formatRupiah(selected.amount)} spent.
            </p>
            <FlowRibbons flow={flow} layout={layout} selected={selected} />
            <div className={styles.columns}>
              <div
                className={`${styles.source} relative min-w-0 rounded-xl border border-border bg-surface p-3`}
                data-flow-source
              >
                <p className="text-xs text-muted">Confirmed spending</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">
                  {formatRupiah(flow.spending)}
                </p>
              </div>
              <fieldset className="relative min-w-0 space-y-2" data-flow-categories>
                <legend className="mb-2 text-xs font-semibold text-muted md:sr-only">
                  Categories
                </legend>
                {flow.categories.map((category, index) => (
                  <button
                    aria-controls={placesId}
                    aria-pressed={category === selected}
                    className={styles.node}
                    key={categoryKey(category)}
                    style={
                      {
                        "--flow-color": categoryColor(category.name, index),
                      } as NodeStyle
                    }
                    onClick={() => {
                      setCategorySelection(categoryKey(category));
                      setMerchantName(null);
                    }}
                    type="button"
                  >
                    <NodeLabel
                      amount={category.amount}
                      caption={`${(chartRatio(category.amount, flow.spending) * 100).toFixed(1)}% of spending`}
                      name={category.name}
                    />
                  </button>
                ))}
              </fieldset>
              <fieldset className="relative min-w-0 space-y-2" data-flow-merchants id={placesId}>
                <legend className="mb-2 text-xs font-semibold text-muted md:sr-only">
                  Places · {selected.name}
                </legend>
                {selected.merchants.map((item) => (
                  <button
                    aria-label={`${item.name}, ${formatRupiah(item.amount)}, ${item.transactions.length} ${item.transactions.length === 1 ? "expense" : "expenses"}. Show payments.`}
                    aria-pressed={merchant === item}
                    className={styles.node}
                    key={item.name}
                    style={
                      {
                        "--flow-color": categoryColor(
                          selected.name,
                          flow.categories.indexOf(selected),
                        ),
                      } as NodeStyle
                    }
                    onClick={() => {
                      if (item.transactions.length === 1 && onOpenTransaction)
                        onOpenTransaction(item.transactions[0]);
                      else setMerchantName(merchantName === item.name ? null : item.name);
                    }}
                    type="button"
                  >
                    <NodeLabel
                      amount={item.amount}
                      caption={`${item.transactions.length} ${item.transactions.length === 1 ? "expense" : "expenses"}`}
                      name={item.name}
                    />
                  </button>
                ))}
              </fieldset>
            </div>
          </div>
          {merchant ? (
            <section aria-live="polite" className="mt-4 rounded-xl bg-surface-secondary p-3">
              <h3 className="text-sm font-semibold">{merchant.name} payments</h3>
              {merchant.transactions.map((record) =>
                onOpenTransaction ? (
                  <TransactionRow
                    key={record.id}
                    onClick={() => onOpenTransaction(record)}
                    showDate
                    transaction={record}
                  />
                ) : (
                  <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm" key={record.id}>
                    <span>
                      {record.date} · {record.method ?? "Account not assigned"}
                    </span>
                    <strong className="tabular-nums">{formatRupiah(record.amount ?? 0)}</strong>
                  </p>
                ),
              )}
            </section>
          ) : null}
        </>
      )}
    </Card>
  );
}

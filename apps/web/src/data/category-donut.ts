const center = 110;
const outerRadius = 97;
const innerRadius = 71;
const fullTurn = Math.PI * 2;
const ratioPrecision = BigInt(1000000000000000);

function point(radius: number, angle: number): string {
  return `${(center + Math.cos(angle) * radius).toFixed(5)},${(center + Math.sin(angle) * radius).toFixed(5)}`;
}

function ringPath(start: number, end: number): string {
  // Subpixel sectors keep their exact amounts in the list, without being enlarged in the graphic.
  if (end - start < 1e-8) return "";
  if (fullTurn - (end - start) < 1e-8) {
    const opposite = start + Math.PI;
    return [
      `M${point(outerRadius, start)}`,
      `A${outerRadius},${outerRadius} 0 1 1 ${point(outerRadius, opposite)}`,
      `A${outerRadius},${outerRadius} 0 1 1 ${point(outerRadius, start)}`,
      `L${point(innerRadius, start)}`,
      `A${innerRadius},${innerRadius} 0 1 0 ${point(innerRadius, opposite)}`,
      `A${innerRadius},${innerRadius} 0 1 0 ${point(innerRadius, start)} Z`,
    ].join(" ");
  }
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(outerRadius, start)}`,
    `A${outerRadius},${outerRadius} 0 ${largeArc} 1 ${point(outerRadius, end)}`,
    `L${point(innerRadius, end)}`,
    `A${innerRadius},${innerRadius} 0 ${largeArc} 0 ${point(innerRadius, start)} Z`,
  ].join(" ");
}

// Bigint totals stay exact. Only bounded angular proportions become floating-point SVG coordinates.
export function categoryDonutGeometry(amounts: readonly bigint[]) {
  const total = amounts.reduce(
    (sum, amount) => sum + (amount > BigInt(0) ? amount : BigInt(0)),
    BigInt(0),
  );
  let accumulated = BigInt(0);
  const ratio = (amount: bigint) =>
    total === BigInt(0) ? 0 : Number((amount * ratioPrecision) / total) / Number(ratioPrecision);
  return amounts.map((amount) => {
    const startRatio = ratio(accumulated);
    accumulated += amount > BigInt(0) ? amount : BigInt(0);
    const endRatio = ratio(accumulated);
    const start = -Math.PI / 2 + startRatio * fullTurn;
    const end = -Math.PI / 2 + endRatio * fullTurn;
    const middle = (start + end) / 2;
    return {
      path: ringPath(start, end),
      proportion: endRatio - startRatio,
      offsetX: Math.cos(middle) * 7,
      offsetY: Math.sin(middle) * 7,
    };
  });
}

// Open arc along the outer guide circle, used to outline the selected slice.
export function donutOutline(startRatio: number, endRatio: number, radius = 118): string {
  const span = Math.min(Math.max(endRatio - startRatio, 0), 0.9999);
  if (span < 1e-6) return "";
  const start = -Math.PI / 2 + startRatio * fullTurn;
  const end = start + span * fullTurn;
  return `M${point(radius, start)} A${radius},${radius} 0 ${span > 0.5 ? 1 : 0} 1 ${point(radius, end)}`;
}

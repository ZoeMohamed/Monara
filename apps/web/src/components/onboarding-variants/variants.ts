import type { ImportDensity } from "@/components/onboarding-import";

export type VariantId = "comfortable" | "compact" | "dense";

/** Variants differ on one axis: how much of the import step fits on the sheet. */
export const variantGroups: {
  heading: string;
  variants: { id: VariantId; label: string; density: ImportDensity }[];
}[] = [
  {
    heading: "Density",
    variants: [
      {
        id: "comfortable",
        label: "Comfortable",
        density: { avatar: 96, row: 58, badge: 36, stats: "tiles" },
      },
      {
        id: "compact",
        label: "Compact",
        density: { avatar: 80, row: 48, badge: 32, stats: "inline" },
      },
      {
        id: "dense",
        label: "Dense",
        density: { avatar: 64, row: 42, badge: 28, stats: "folded" },
      },
    ],
  },
];

export const allVariants = variantGroups.flatMap((group) => group.variants);
export const defaultVariant = allVariants[0]?.id ?? "comfortable";

export function parseVariant(value: string | null): VariantId | null {
  return allVariants.find((variant) => variant.id === value)?.id ?? null;
}

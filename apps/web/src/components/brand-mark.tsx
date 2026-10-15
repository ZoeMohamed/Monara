import Image from "next/image";
import type { CSSProperties } from "react";
import styles from "@/components/brand-mark.module.css";
import { type BrandLogo, brandLogoSource } from "@/data/brand-identity";

// Adjacent labels already name the brand; the image is decorative. Marks are tiny,
// mixed-format local files, so they skip the image optimizer.
export function BrandMark({ brand, size = 40 }: { brand: BrandLogo; size?: number }) {
  const source = brandLogoSource(brand);
  return (
    <span
      aria-hidden
      className={styles.mark}
      data-brand={brand}
      data-vector={source.startsWith("/brand-icons/")}
      style={{ "--brand-size": `${size}px` } as CSSProperties}
    >
      <Image alt="" height={size} src={source} unoptimized width={size} />
    </span>
  );
}

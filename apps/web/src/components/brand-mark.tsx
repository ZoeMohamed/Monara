import Image from "next/image";
import type { CSSProperties } from "react";
import styles from "@/components/brand-mark.module.css";
import { type BrandIdentity, brands } from "@/data/brand-identity";

// Adjacent labels already name the brand; the image is decorative.
export function BrandMark({ brand, size = 40 }: { brand: BrandIdentity; size?: number }) {
  return (
    <span
      aria-hidden
      className={styles.mark}
      data-brand={brand}
      style={{ "--brand-size": `${size}px` } as CSSProperties}
    >
      <Image alt="" height={size} src={`/brands/${brands[brand].asset}`} width={size} />
    </span>
  );
}

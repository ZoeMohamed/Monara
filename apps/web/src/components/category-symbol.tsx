import type { CSSProperties } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { chosenCategoryIcon, chosenCategoryLogo } from "@/data/category-icons";

/** A category's brand logo when it has one, otherwise its symbol in the caller's tile. */
export function CategoryAvatar({
  name,
  icon,
  size = 40,
  className,
  iconClassName,
  style,
}: {
  name: string;
  icon?: string | null;
  size?: number;
  className?: string;
  iconClassName?: string;
  style?: CSSProperties;
}) {
  const logo = chosenCategoryLogo(name, icon);
  if (logo) return <BrandMark brand={logo} size={size} />;
  return (
    <span aria-hidden className={className} style={style}>
      <Icon className={iconClassName} name={chosenCategoryIcon(name, icon)} />
    </span>
  );
}

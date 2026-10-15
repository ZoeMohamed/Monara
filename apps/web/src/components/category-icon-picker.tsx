"use client";

import { Button } from "@monara/ui";
import { useId } from "react";
import { BrandMark } from "@/components/brand-mark";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { LogoSearch } from "@/components/logo-search";
import { brandForName, brandLogoChoice, brandLogoFromChoice } from "@/data/brand-identity";
import { categoryIconChoices, chosenCategoryIcon, chosenCategoryLogo } from "@/data/category-icons";

// The symbol follows the name as it is typed (a brand's logo, else a matching symbol);
// choosing anything here overrides that.
export function CategoryIconPicker({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: string | null;
  onChange: (icon: string | null) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const detected = brandForName(name);
  const logo = chosenCategoryLogo(name, value);
  const symbol = logo ? null : chosenCategoryIcon(name, value);
  const picked = brandLogoFromChoice(value);
  return (
    <fieldset aria-labelledby={labelId} className={styles.field} disabled={disabled}>
      <legend className={styles.label} id={labelId}>
        Icon
      </legend>
      <div className={styles.iconChoices}>
        {[detected, picked && picked !== detected ? picked : undefined].map((brand) =>
          brand ? (
            <Button
              aria-label={`${name || "Brand"} logo`}
              aria-pressed={logo === brand}
              className={styles.logoChoice}
              isDisabled={disabled}
              key={brand}
              onPress={() => onChange(brand === detected ? null : brandLogoChoice(brand))}
              variant={logo === brand ? "primary" : "secondary"}
            >
              <BrandMark brand={brand} size={32} />
            </Button>
          ) : null,
        )}
        {categoryIconChoices.map((icon) => (
          <Button
            aria-label={`${icon.name} icon`}
            aria-pressed={symbol === icon.id}
            className="min-h-11 min-w-11 rounded-xl"
            isDisabled={disabled}
            isIconOnly
            key={icon.id}
            onPress={() => onChange(icon.id)}
            variant={symbol === icon.id ? "primary" : "secondary"}
          >
            <Icon className="h-5 w-5" name={icon.id} />
          </Button>
        ))}
      </div>
      <div className="mt-3">
        <LogoSearch
          disabled={disabled}
          onPick={(brand) => onChange(brand === detected ? null : brandLogoChoice(brand))}
          selected={logo}
          suggestionQuery={detected ? "" : name}
        />
      </div>
    </fieldset>
  );
}

"use client";

import { Button } from "@monara/ui";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { LogoSearch } from "@/components/logo-search";
import { setBrandLogoChoice, useBrandLogoChoice } from "@/components/use-brand-logo";
import {
  type BrandKind,
  type BrandLogo,
  brandLogoChoice,
  brandLogoFromChoice,
  brands,
  brandsOfKind,
  institutionBrand,
  isBrandIdentity,
  merchantBrand,
} from "@/data/brand-identity";

function caption(logo: BrandLogo | undefined, named: boolean) {
  if (logo)
    return isBrandIdentity(logo) ? `Logo: ${brands[logo].name}` : "Logo: chosen from search";
  return named ? "No logo matched this name." : "The logo appears as you type a name.";
}

function LogoPreview({ logo, scope }: { logo?: BrandLogo; scope: "merchant" | "institution" }) {
  if (logo) return <BrandMark brand={logo} size={36} />;
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
    >
      <Icon className="h-4 w-4" name={scope === "merchant" ? "store" : "bank"} />
    </span>
  );
}

// Registered institutions are saved by name so the record itself identifies them; any
// other pick is remembered for the typed (or adopted) name only.
function applyPick(
  picked: BrandLogo,
  name: string,
  label: string,
  detected: BrandLogo | undefined,
  onUseName?: (name: string) => void,
) {
  if (onUseName && isBrandIdentity(picked)) {
    onUseName(brands[picked].name);
    setBrandLogoChoice(brands[picked].name, null);
    return;
  }
  if (onUseName && label.trim().length === 0) {
    onUseName(name);
    setBrandLogoChoice(name, brandLogoChoice(picked));
    return;
  }
  setBrandLogoChoice(label, picked === detected ? null : brandLogoChoice(picked));
}

/**
 * Shows the logo a merchant or institution name resolves to as it is typed. Changing it
 * saves a display preference for that exact name in this browser; it never edits the record.
 */
export function BrandLogoField({
  label,
  scope,
  kinds,
  disabled = false,
  onUseName,
}: {
  label: string;
  scope: "merchant" | "institution";
  kinds?: readonly BrandKind[];
  disabled?: boolean;
  /** Institutions take a registered brand's name, so the saved institution identifies it. */
  onUseName?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const choice = useBrandLogoChoice(label);
  const detected = scope === "merchant" ? merchantBrand(label) : institutionBrand(label);
  const logo = choice === "none" ? undefined : (brandLogoFromChoice(choice) ?? detected);
  const named = label.trim().length > 0;
  const selectionDisabled = disabled || (!named && !onUseName);
  return (
    <div className="grid gap-2">
      <div className="flex min-h-11 items-center gap-3">
        <LogoPreview logo={logo} scope={scope} />
        <p className="min-w-0 flex-1 text-xs text-muted">{caption(logo, named)}</p>
        <Button
          aria-expanded={open}
          className="min-h-11 rounded-full px-3 text-xs"
          isDisabled={selectionDisabled}
          onPress={() => setOpen((value) => !value)}
          variant="ghost"
        >
          {open ? "Close" : "Change logo"}
        </Button>
      </div>
      {open ? (
        <div className="grid gap-2 rounded-2xl bg-surface-secondary p-3">
          <LogoSearch
            disabled={selectionDisabled}
            idleChoices={scope === "institution" ? brandsOfKind(kinds ?? ["bank", "wallet"]) : []}
            kinds={kinds}
            onPick={(picked, name) => {
              applyPick(picked, name, label, detected, onUseName);
              setOpen(false);
            }}
            selected={logo}
            suggestionQuery={detected ? "" : label}
          />
          {logo && named ? (
            <Button
              className="min-h-11 justify-self-start rounded-full px-3 text-xs"
              isDisabled={disabled}
              onPress={() => {
                setBrandLogoChoice(label, "none");
                setOpen(false);
              }}
              variant="ghost"
            >
              Show no logo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { Button, Input, Label, TextField } from "@monara/ui";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import {
  type BrandKind,
  type BrandLogo,
  brandLogoSlug,
  brands,
  searchBrands,
} from "@/data/brand-identity";

type LogoOption = { logo: BrandLogo; name: string };
type CatalogResult = { query: string; options: LogoOption[] } | { query: string; error: true };

function isCatalogLogo(value: unknown): value is { slug: string; title: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "slug" in value &&
    "title" in value &&
    typeof value.slug === "string" &&
    /^[a-z0-9]{1,60}$/.test(value.slug) &&
    typeof value.title === "string"
  );
}

async function fetchCatalog(query: string, signal: AbortSignal): Promise<LogoOption[]> {
  const response = await fetch(`/api/brands?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error("Logo search failed.");
  const body: unknown = await response.json();
  const logos =
    typeof body === "object" && body !== null && "logos" in body && Array.isArray(body.logos)
      ? body.logos.filter(isCatalogLogo)
      : [];
  return logos.map((logo) => ({ logo: `si:${logo.slug}` as const, name: logo.title }));
}

function useCatalogSearch(enabled: boolean) {
  const [result, setResult] = useState<CatalogResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );
  const search = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    const query = value.trim();
    if (!enabled || query.length < 2 || query.length > 60) return;
    timer.current = setTimeout(() => {
      const controller = new AbortController();
      request.current = controller;
      fetchCatalog(query, controller.signal)
        .then((options) => setResult({ query, options }))
        .catch((error: unknown) => {
          if (!controller.signal.aborted && error instanceof Error)
            setResult({ query, error: true });
        });
    }, 250);
  };
  return { result, search };
}

function logoOptions(
  text: string,
  kinds: readonly BrandKind[] | undefined,
  idleChoices: readonly BrandLogo[],
  current: CatalogResult | null,
): LogoOption[] {
  const local: LogoOption[] = (
    text.length > 0
      ? searchBrands(text, kinds, 8)
      : idleChoices.filter((logo) => !logo.startsWith("si:"))
  ).map((id) => ({ logo: id, name: brands[id as keyof typeof brands].name }));
  if (!current || !("options" in current)) return local;
  const names = new Set(local.map((item) => item.name.toLowerCase()));
  const slugs = new Set(local.map((item) => `si:${brandLogoSlug(item.logo)}`));
  return [
    ...local,
    ...current.options.filter(
      (option) => !names.has(option.name.toLowerCase()) && !slugs.has(option.logo),
    ),
  ];
}

function searchStatus(
  typed: boolean,
  catalog: boolean,
  text: string,
  current: CatalogResult | null,
  found: number,
) {
  if (!typed || text.length === 0) return null;
  if (text.length > 60) return "Use up to 60 characters to search logos.";
  if (catalog && !current && text.length >= 2) return "Searching logos…";
  if (current && "error" in current) return "Logo search is unavailable right now.";
  return found === 0 ? `No logo found for “${text}”.` : null;
}

function LogoResults({
  options,
  selected,
  disabled,
  onPick,
}: {
  options: LogoOption[];
  selected?: BrandLogo;
  disabled: boolean;
  onPick: (logo: BrandLogo, name: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="flex min-w-0 flex-wrap gap-2">
      <legend className="sr-only">Matching logos</legend>
      {options.map((option) => (
        <Button
          aria-label={`Use the ${option.name} logo`}
          aria-pressed={selected === option.logo}
          className="h-auto min-h-11 max-w-full rounded-xl px-2.5 py-1.5 text-xs"
          isDisabled={disabled}
          key={option.logo}
          onPress={() => onPick(option.logo, option.name)}
          variant={selected === option.logo ? "secondary" : "ghost"}
        >
          <BrandMark brand={option.logo} size={28} />
          <span className="truncate">{option.name}</span>
        </Button>
      ))}
    </fieldset>
  );
}

/**
 * Registered brands match instantly while typing; the wider Simple Icons catalog is
 * searched on this app's server once typing pauses.
 */
export function LogoSearch({
  kinds,
  suggestionQuery,
  selected,
  onPick,
  disabled = false,
  catalog = true,
  idleChoices = [],
}: {
  kinds?: readonly BrandKind[];
  suggestionQuery: string;
  selected?: BrandLogo;
  onPick: (logo: BrandLogo, name: string) => void;
  disabled?: boolean;
  catalog?: boolean;
  idleChoices?: readonly BrandLogo[];
}) {
  const [query, setQuery] = useState<string | null>(null);
  const { result, search } = useCatalogSearch(catalog);
  const text = (query ?? suggestionQuery).trim();
  const current = result?.query === text ? result : null;
  const options = logoOptions(text, kinds, idleChoices, current);
  const status = searchStatus(query !== null, catalog, text, current, options.length);
  return (
    <div className="grid gap-2">
      <TextField
        isDisabled={disabled}
        name="logoSearch"
        onChange={(value) => {
          setQuery(value);
          search(value);
        }}
        value={query ?? ""}
      >
        <Label>Search brand logos</Label>
        <Input
          autoComplete="off"
          className="min-h-11 text-base"
          placeholder="e.g. Netflix, BCA, Shopee"
          type="search"
        />
      </TextField>
      <LogoResults disabled={disabled} onPick={onPick} options={options} selected={selected} />
      <p aria-live="polite" className="text-xs text-muted">
        {status}
      </p>
    </div>
  );
}

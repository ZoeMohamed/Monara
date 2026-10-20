import type { GmailImportFeedItem } from "./import-feed.ts";

/** Refresh shown records in place, preserving their keys so updates do not replay entry motion. */
export function mergeImportFeed(
  current: GmailImportFeedItem[],
  latest: GmailImportFeedItem[],
): GmailImportFeedItem[] {
  const refreshed = new Map(latest.map((item) => [item.id, item]));
  const shown = new Set(current.map((item) => item.id));
  return [
    ...latest.filter((item) => !shown.has(item.id)),
    ...current.map((item) => refreshed.get(item.id) ?? item),
  ];
}

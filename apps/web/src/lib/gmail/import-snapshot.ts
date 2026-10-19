import { loadGmailConnections } from "./client.ts";
import { loadImportFeed } from "./import-feed.ts";

/** Keep regular polling concurrent, then read final rows after completion is observed. */
export async function loadImportSnapshot(mailboxId: string, signal?: AbortSignal) {
  const [mailboxes, feed] = await Promise.all([
    loadGmailConnections({ signal }),
    loadImportFeed(mailboxId, signal),
  ]);
  const sync = mailboxes.find((mailbox) => mailbox.id === mailboxId)?.sync;
  if (!sync || signal?.aborted) return null;
  // A parallel feed read may precede the last classification commit. Do not publish
  // completion until a subsequent read succeeds, or the UI would stop polling stale rows.
  const settledFeed = sync.state === "completed" ? await loadImportFeed(mailboxId, signal) : feed;
  return { sync, feed: settledFeed };
}

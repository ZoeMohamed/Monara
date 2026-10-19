import { userIdSchema } from "@monara/contracts";
import { createSupabaseGoalImageUploadRepository } from "@monara/core";
import type { MonaraServiceRoleClient } from "@monara/db";

import { GOAL_IMAGE_BUCKET } from "./image.ts";

const STORAGE_PAGE_SIZE = 100;
const MAX_STORAGE_DEPTH = 8;
const MAX_INVENTORY_CALLS = 20;
const UPLOAD_RECONCILIATION_BATCH = 8;

function unavailable(): never {
  throw new Error("Account image cleanup is temporarily unavailable.");
}

/**
 * Drain the first remaining page, never incrementing an offset while deleting.
 * Storage folders are virtual: removing their last file removes the folder too.
 * A bounded batch keeps the durable deletion lease available for later retries.
 */
export async function cleanUserGoalImages(
  client: MonaraServiceRoleClient,
  userIdValue: string,
): Promise<boolean> {
  const userId = userIdSchema.parse(userIdValue);
  const bucket = client.storage.from(GOAL_IMAGE_BUCKET);
  const uploads = createSupabaseGoalImageUploadRepository(client);
  const pending = await uploads.listPending(userId);
  const outcomes = await Promise.all(
    pending.slice(0, UPLOAD_RECONCILIATION_BATCH).map(async (upload) => {
      // A visible object proves this opaque, backend-only upload reached Storage.
      // Absence proves nothing about an interrupted request; never expire its intent.
      const visible = await bucket.info(upload.objectPath);
      if (visible.error || !visible.data) {
        return false;
      }
      await uploads.settle({ userId, uploadId: upload.uploadId });
      return true;
    }),
  );
  // Another batch may contain unresolved intents. Never remove the only positive
  // completion evidence until every pending upload has been reconciled.
  if (outcomes.includes(false) || (await uploads.listPending(userId)).length > 0) return false;
  let inventoryCalls = 0;
  let rootEmpty = false;

  async function firstFiles(prefix: string, depth: number): Promise<string[]> {
    if (depth > MAX_STORAGE_DEPTH || inventoryCalls >= MAX_INVENTORY_CALLS) unavailable();
    inventoryCalls += 1;
    const inventory = await bucket.list(
      prefix,
      { limit: STORAGE_PAGE_SIZE, offset: 0, sortBy: { column: "name", order: "asc" } },
      { signal: AbortSignal.timeout(5_000) },
    );
    if (inventory.error || !inventory.data) unavailable();
    if (depth === 0) rootEmpty = inventory.data.length === 0;

    const files: string[] = [];
    for (const entry of inventory.data) {
      // A malformed provider response must never escape the verified owner's prefix.
      if (!entry.name || entry.name === "." || entry.name === ".." || /[/\\]/.test(entry.name))
        unavailable();
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        const nested = await firstFiles(path, depth + 1);
        if (nested.length > 0) return nested;
      } else {
        files.push(path);
      }
    }
    return files;
  }

  const paths = await firstFiles(userId, 0);
  if (paths.length === 0) return rootEmpty;
  const removed = await bucket.remove(paths);
  if (removed.error) unavailable();
  // A subsequent leased step verifies an empty prefix, including any other pages.
  return false;
}

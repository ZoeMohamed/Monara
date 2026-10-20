import { financialGoalIdSchema, isoDateTimeSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";

import { requireActiveUser } from "@/lib/auth/user-deletion";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import {
  detectGoalImage,
  GOAL_IMAGE_BUCKET,
  goalUploadResponseCompleted,
  MAX_GOAL_IMAGE_BYTES,
  validGoalImageContentLength,
} from "@/lib/goals/image";
import { goalImageBackend } from "@/lib/goals/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { createServerSupabaseClient, getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function cleanUpGoalImage(
  remove: () => Promise<{ error: unknown }>,
  warning: string,
): Promise<void> {
  try {
    const cleanup = await remove();
    if (!cleanup.error) return;
  } catch {
    // Cleanup is best-effort and must not change the result of the primary operation.
  }
  process.emitWarning(warning, { code: "MONARA_GOAL_IMAGE_CLEANUP_FAILED" });
}

async function authenticatedGoal(goalIdValue: string) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) throw new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue.");
  const goalId = financialGoalIdSchema.parse(goalIdValue);
  const backend = goalImageBackend();
  const goal = await backend.repository.findFinancialGoal(identity.id, goalId);
  if (!goal || goal.deletedAt)
    throw new FinanceOperationError("NOT_FOUND", "That Goal was not found.");
  return { ...backend, goal, userId: identity.id };
}

export async function GET(_request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  try {
    const { goalId } = await params;
    const { client, goal } = await authenticatedGoal(goalId);
    if (!goal.imagePath)
      return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const signed = await client.storage.from(GOAL_IMAGE_BUCKET).createSignedUrl(goal.imagePath, 60);
    if (signed.error)
      throw new FinanceOperationError("DEPENDENCY_UNAVAILABLE", "The goal image is unavailable.");
    return new Response(null, {
      status: 307,
      headers: { Location: signed.data.signedUrl, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  if (!isSameOriginRequest(request))
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  try {
    if (!validGoalImageContentLength(request.headers.get("content-length")))
      throw new FinanceOperationError("VALIDATION_FAILED", "Choose an image smaller than 3 MB.");
    const { goalId } = await params;
    const { client, goal, repository, uploads, userId } = await authenticatedGoal(goalId);
    const form = await request.formData();
    const image = form.get("image");
    const expectedUpdatedAt = isoDateTimeSchema.parse(form.get("expectedUpdatedAt"));
    if (!(image instanceof File) || image.size === 0 || image.size > MAX_GOAL_IMAGE_BYTES)
      throw new FinanceOperationError(
        "VALIDATION_FAILED",
        "Choose a JPEG, PNG, or WebP under 3 MB.",
      );
    const bytes = new Uint8Array(await image.arrayBuffer());
    const kind = detectGoalImage(bytes);
    if (!kind)
      throw new FinanceOperationError(
        "VALIDATION_FAILED",
        "Choose a valid JPEG, PNG, or WebP image.",
      );
    // Reading the request body can take time. Recheck the owned record and identity
    // before sending any bytes, rather than uploading a stale or deleting Goal.
    await requireActiveUser(userId);
    const latestGoal = await repository.findFinancialGoal(userId, goal.id);
    if (!latestGoal || latestGoal.deletedAt)
      throw new FinanceOperationError("NOT_FOUND", "That Goal was not found.");
    if (Date.parse(latestGoal.updatedAt) !== Date.parse(expectedUpdatedAt))
      throw new FinanceOperationError("CONFLICT", "That Goal changed. Reload it and try again.");
    const uploadId = crypto.randomUUID();
    const path = `${userId}/${goal.id}/${crypto.randomUUID()}.${kind.extension}`;
    // Keep this nonce private until completion. Only the backend registers an
    // intent; deletion retains it if Storage's outcome becomes uncertain.
    const uploadClient = await createServerSupabaseClient();
    const uploadIdentity = {
      uploadId,
      userId,
      goalId: goal.id,
      objectPath: path,
      expectedUpdatedAt,
    };
    try {
      await uploads.begin(uploadIdentity);
    } catch (error) {
      try {
        // No Storage call has been made. A closed tombstone also handles a
        // registration RPC that commits after its response was interrupted.
        await uploads.cancelUnstarted(uploadIdentity);
      } catch {
        process.emitWarning("An unstarted goal image upload could not be closed.", {
          code: "MONARA_GOAL_IMAGE_CLEANUP_FAILED",
        });
      }
      throw error;
    }
    let updated: Awaited<ReturnType<typeof repository.setFinancialGoalImage>>;
    let completed = false;
    let settled = false;
    try {
      const uploaded = await uploadClient.storage.from(GOAL_IMAGE_BUCKET).upload(path, bytes, {
        cacheControl: "0",
        contentType: kind.contentType,
        upsert: false,
      });
      completed = goalUploadResponseCompleted(uploaded.error);
      if (completed) {
        await uploads.settle({ uploadId, userId });
        settled = true;
      }
      if (uploaded.error)
        throw new FinanceOperationError(
          "DEPENDENCY_UNAVAILABLE",
          "The image could not be uploaded.",
        );
      await requireActiveUser(userId);
      updated = await repository.setFinancialGoalImage({
        userId,
        goalId: goal.id,
        expectedUpdatedAt,
        imagePath: path,
      });
    } catch (error) {
      if (!settled) {
        try {
          if (!completed) {
            const visible = await client.storage.from(GOAL_IMAGE_BUCKET).info(path);
            completed = !visible.error && visible.data !== null;
          }
          if (completed) {
            await uploads.settle({ uploadId, userId });
            settled = true;
          }
        } catch {
          // Preserve a pending intent and any visible object as durable evidence.
          // Account cleanup can reconcile it later; absence is never completion.
        }
      }
      if (settled)
        await cleanUpGoalImage(
          () => client.storage.from(GOAL_IMAGE_BUCKET).remove([path]),
          "A failed goal image upload could not be cleaned up.",
        );
      throw error;
    }
    const previousImagePath = latestGoal.imagePath;
    if (previousImagePath)
      await cleanUpGoalImage(
        () => client.storage.from(GOAL_IMAGE_BUCKET).remove([previousImagePath]),
        "A replaced goal image could not be cleaned up.",
      );
    return financeSuccessResponse(updated);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  if (!isSameOriginRequest(request))
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  try {
    const { goalId } = await params;
    const { client, goal, repository, userId } = await authenticatedGoal(goalId);
    const body: unknown = await request.json();
    const expectedUpdatedAt = isoDateTimeSchema.parse(
      typeof body === "object" && body !== null && "expectedUpdatedAt" in body
        ? body.expectedUpdatedAt
        : undefined,
    );
    const updated = await repository.setFinancialGoalImage({
      userId,
      goalId: goal.id,
      expectedUpdatedAt,
      imagePath: null,
    });
    const removedImagePath = goal.imagePath;
    if (removedImagePath)
      await cleanUpGoalImage(
        () => client.storage.from(GOAL_IMAGE_BUCKET).remove([removedImagePath]),
        "A removed goal image could not be cleaned up.",
      );
    return financeSuccessResponse(updated);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

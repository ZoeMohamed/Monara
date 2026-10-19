import { financialGoalIdSchema, isoDateTimeSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";

import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import {
  detectGoalImage,
  GOAL_IMAGE_BUCKET,
  MAX_GOAL_IMAGE_BYTES,
  validGoalImageContentLength,
} from "@/lib/goals/image";
import { goalImageBackend } from "@/lib/goals/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

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
    return Response.redirect(signed.data.signedUrl, 307);
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
    const { client, goal, repository, userId } = await authenticatedGoal(goalId);
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
    const path = `${userId}/${goal.id}/${crypto.randomUUID()}.${kind.extension}`;
    const uploaded = await client.storage.from(GOAL_IMAGE_BUCKET).upload(path, bytes, {
      cacheControl: "31536000",
      contentType: kind.contentType,
      upsert: false,
    });
    if (uploaded.error)
      throw new FinanceOperationError("DEPENDENCY_UNAVAILABLE", "The image could not be uploaded.");
    let updated: Awaited<ReturnType<typeof repository.setFinancialGoalImage>>;
    try {
      updated = await repository.setFinancialGoalImage({
        userId,
        goalId: goal.id,
        expectedUpdatedAt,
        imagePath: path,
      });
    } catch (error) {
      await cleanUpGoalImage(
        () => client.storage.from(GOAL_IMAGE_BUCKET).remove([path]),
        "A failed goal image upload could not be cleaned up.",
      );
      throw error;
    }
    const previousImagePath = goal.imagePath;
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

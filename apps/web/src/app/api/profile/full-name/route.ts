import { FinanceOperationError } from "@monara/core";

import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { profileService } from "@/lib/profile/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Saves the signed-in User's full name. The User comes from the session, never the body. */
export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return financeErrorResponse(
      new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."),
    );
  }
  try {
    return financeSuccessResponse(
      await profileService().setFullName(identity.id, await request.json()),
    );
  } catch (error) {
    return financeErrorResponse(error);
  }
}

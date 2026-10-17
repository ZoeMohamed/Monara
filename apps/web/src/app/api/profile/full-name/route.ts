import { FinanceOperationError } from "@monara/core";
import { after } from "next/server";

import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { importAfterNameSaved } from "@/lib/gmail/import";
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
    const saved = await profileService().setFullName(identity.id, await request.json());
    // Mailboxes that already have accounts but were never imported start now.
    after(() => importAfterNameSaved(identity.id).catch(() => undefined));
    return financeSuccessResponse(saved);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

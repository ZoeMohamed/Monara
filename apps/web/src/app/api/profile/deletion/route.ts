import { deleteUserInputSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";
import { cookies } from "next/headers";
import { after } from "next/server";
import { DELETION_COOKIE, deletionReceipt } from "@/lib/auth/deletion-receipt";
import { identityFromVerifiedClaims } from "@/lib/auth/identity";
import { deletionStatus, processUserDeletions } from "@/lib/auth/user-deletion";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { createServerSupabaseClient, getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  }
  try {
    const input = deleteUserInputSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const claims = await supabase.auth.getClaims();
    const identity = claims.error ? null : identityFromVerifiedClaims(claims.data?.claims);
    if (!identity) throw new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue.");
    if (identity.demoAccount) {
      throw new FinanceOperationError("FORBIDDEN", "The shared demo account cannot be deleted.");
    }
    // Build the receipt before the irreversible transaction so missing signing
    // configuration cannot accept deletion without a usable progress receipt.
    const receipt = deletionReceipt(identity.id, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
    const result = await supabase.rpc("begin_user_deletion", {
      p_confirmation: input.confirmation,
      p_acknowledged: input.acknowledged,
    });
    if (result.error) {
      throw new FinanceOperationError(
        result.error.code === "42501" ? "UNAUTHENTICATED" : "DEPENDENCY_UNAVAILABLE",
        "Account deletion could not be started. Check your connection and try again.",
      );
    }
    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (/^sb-.*-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(cookie.name))
        cookieStore.delete(cookie.name);
    }
    cookieStore.set(DELETION_COOKIE, receipt, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    after(() => processUserDeletions(identity.id).catch(() => undefined));
    return Response.json(
      { status: "pending" },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function GET() {
  try {
    if (await getAuthenticatedIdentity()) {
      throw new FinanceOperationError("CONFLICT", "This account has no accepted deletion.");
    }
    const status = await deletionStatus();
    if (!status)
      throw new FinanceOperationError("UNAUTHENTICATED", "A deletion receipt is required.");
    return financeSuccessResponse({ status });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

import { FinanceOperationError } from "@monara/core";

import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";
import { whatsAppLinkService } from "@/lib/whatsapp/service";

export const runtime = "nodejs";

const unauthenticated = () =>
  financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."));
const crossOrigin = () =>
  financeErrorResponse(
    new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
  );

/** The signed-in User's WhatsApp Link, without the number itself. */
export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    return financeSuccessResponse(await whatsAppLinkService().status(identity.id));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

/** Starts linking a number and returns the code to send from it, once. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return crossOrigin();
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    return financeSuccessResponse(
      await whatsAppLinkService().start(identity.id, await request.json()),
    );
  } catch (error) {
    return financeErrorResponse(error);
  }
}

/** Unlinks WhatsApp. Messages from the number are then answered as unlinked. */
export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return crossOrigin();
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    await whatsAppLinkService().unlink(identity.id);
    return financeSuccessResponse({ ok: true });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

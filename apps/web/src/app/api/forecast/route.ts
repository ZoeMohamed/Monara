import { forecastResponseSchema } from "@monara/contracts";
import { FinanceOperationError } from "@monara/core";

import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { forecastService } from "@/lib/forecast/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** A refresh reads recent expenses and may wait for the model. */
export const maxDuration = 60;

const unauthenticated = () =>
  financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Sign in to continue."));

/** The signed-in User's latest spending forecast, or null before the first one. */
export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    const forecast = await forecastService().service.get(identity.id);
    return financeSuccessResponse(forecastResponseSchema.parse({ forecast }));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

/** Makes a fresh forecast now. This is the Refresh button, and it is what a demo triggers by hand. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return financeErrorResponse(
      new FinanceOperationError("FORBIDDEN", "This request must come from Monara."),
    );
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    const forecast = await forecastService().service.refresh(identity.id, "manual");
    return financeSuccessResponse(forecastResponseSchema.parse({ forecast }));
  } catch (error) {
    return financeErrorResponse(error);
  }
}

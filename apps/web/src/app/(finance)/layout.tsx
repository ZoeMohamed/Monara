import { financialCalendarDate } from "@monara/contracts";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FinanceUnavailable } from "@/components/finance-unavailable";
import { MonaraApp } from "@/components/monara-app";
import { UserSessionGuard } from "@/components/user-session-guard";
import { profileFromIdentity } from "@/lib/auth/identity";
import { setupKeyForUser } from "@/lib/auth/setup-key";
import {
  FinancePresentationError,
  type FinanceSnapshot,
  loadFinanceSnapshot,
} from "@/lib/finance/presentation";
import { runFinanceOperation } from "@/lib/finance/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/");
  const today = financialCalendarDate();
  let initialFinance: FinanceSnapshot;
  try {
    initialFinance = await loadFinanceSnapshot(
      (operation, input) =>
        runFinanceOperation(
          operation,
          { userId: identity.id, channel: "web", directSource: "manual_form" },
          input,
        ),
      today.slice(0, 7),
      today,
    );
  } catch (error) {
    return (
      <FinanceUnavailable
        message={error instanceof FinancePresentationError ? error.message : undefined}
      />
    );
  }
  return (
    <Suspense
      fallback={
        <main aria-busy="true" className="min-h-dvh bg-background p-6 text-muted">
          <p role="status">Opening Monara…</p>
        </main>
      }
    >
      <UserSessionGuard setupKey={setupKeyForUser(identity.id)}>
        <MonaraApp
          initialFinance={initialFinance}
          profile={{ ...profileFromIdentity(identity), setupKey: setupKeyForUser(identity.id) }}
        >
          {children}
        </MonaraApp>
      </UserSessionGuard>
    </Suspense>
  );
}

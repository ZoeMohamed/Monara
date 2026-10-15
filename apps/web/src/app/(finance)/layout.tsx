import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FinanceUnavailable } from "@/components/finance-unavailable";
import { MonaraApp } from "@/components/monara-app";
import { profileFromIdentity } from "@/lib/auth/identity";
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
  const today = new Date().toISOString().slice(0, 10);
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
      <MonaraApp initialFinance={initialFinance} profile={profileFromIdentity(identity)}>
        {children}
      </MonaraApp>
    </Suspense>
  );
}

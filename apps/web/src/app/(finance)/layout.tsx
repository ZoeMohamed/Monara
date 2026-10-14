import { redirect } from "next/navigation";
import { Suspense } from "react";

import { MonaraApp } from "@/components/monara-app";
import { profileFromIdentity } from "@/lib/auth/identity";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/");
  return (
    <Suspense
      fallback={
        <main aria-busy="true" className="min-h-dvh bg-background p-6 text-muted">
          <p role="status">Opening Monara…</p>
        </main>
      }
    >
      <MonaraApp profile={profileFromIdentity(identity)}>{children}</MonaraApp>
    </Suspense>
  );
}

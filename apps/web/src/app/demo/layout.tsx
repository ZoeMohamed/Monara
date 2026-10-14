import type { Metadata } from "next";
import { Suspense } from "react";

import { MonaraApp } from "@/components/monara-app";

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Monara demo" },
  robots: { index: false },
};

// The public demo renders sample records in browser memory only. It never reads
// identity or calls financial operations, so it needs no session.
const demoProfile = { displayName: "Demo guest", email: null, initials: "D" };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main aria-busy="true" className="min-h-dvh bg-background p-6 text-muted">
          <p role="status">Opening the demo…</p>
        </main>
      }
    >
      <MonaraApp profile={demoProfile}>{children}</MonaraApp>
    </Suspense>
  );
}

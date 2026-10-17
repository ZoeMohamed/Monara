import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p className="text-[var(--muted)] text-sm">
        The terms for using Monara will be published here.
      </p>
    </LegalPage>
  );
}

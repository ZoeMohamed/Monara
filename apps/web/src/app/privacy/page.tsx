import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p className="text-[var(--muted)] text-sm">
        How Monara handles your email and financial data will be described here.
      </p>
    </LegalPage>
  );
}

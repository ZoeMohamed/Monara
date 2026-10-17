import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { terms } from "@/lib/legal/terms";

export const metadata: Metadata = { title: terms.title };

export default function TermsPage() {
  return <LegalPage document={terms} />;
}

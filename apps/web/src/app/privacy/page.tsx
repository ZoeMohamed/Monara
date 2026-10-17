import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { privacy } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: privacy.title };

export default function PrivacyPage() {
  return <LegalPage document={privacy} />;
}

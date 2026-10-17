import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { privacy } from "@/lib/legal/privacy";
import { legalReturnPath } from "@/lib/legal/return";

export const metadata: Metadata = { title: privacy.title };

export default async function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  const { from } = await searchParams;
  return <LegalPage backTo={legalReturnPath(from)} document={privacy} />;
}

import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { legalReturnPath } from "@/lib/legal/return";
import { terms } from "@/lib/legal/terms";

export const metadata: Metadata = { title: terms.title };

export default async function TermsPage({ searchParams }: PageProps<"/terms">) {
  const { from } = await searchParams;
  return <LegalPage backTo={legalReturnPath(from)} document={terms} />;
}

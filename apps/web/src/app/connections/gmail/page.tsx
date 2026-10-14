import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GmailConnectionsClient } from "@/components/gmail-connections-client";
import { gmailCallbackError } from "@/lib/gmail/client";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gmail connections" };

export default async function GmailConnectionsPage({
  searchParams,
}: PageProps<"/connections/gmail">) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/connections/gmail");

  const params = await searchParams;
  return <GmailConnectionsClient callbackError={gmailCallbackError(params.result)} />;
}

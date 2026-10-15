import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GmailConnectionsClient } from "@/components/gmail-connections-client";
import { gmailPageTunnelRedirect } from "@/lib/gmail/callback";
import { gmailCallbackError } from "@/lib/gmail/client";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gmail connections" };

export default async function GmailConnectionsPage({
  searchParams,
}: PageProps<"/connections/gmail">) {
  const tunnel = gmailPageTunnelRedirect((await headers()).get("host"));
  if (tunnel) redirect(tunnel);
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/connections/gmail");

  const params = await searchParams;
  return <GmailConnectionsClient callbackError={gmailCallbackError(params.result)} />;
}

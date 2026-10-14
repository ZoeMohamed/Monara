import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GmailConnectionsScreen } from "@/components/gmail-connections-screen";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gmail connections" };

export default async function GmailConnectionsPage() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/connections/gmail");

  // AD1 will supply verified connection state. No provider data is simulated here.
  return <GmailConnectionsScreen state={{ status: "unavailable" }} />;
}

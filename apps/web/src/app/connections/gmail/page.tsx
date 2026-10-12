import type { Metadata } from "next";
import { GmailConnectionsScreen } from "@/components/gmail-connections-screen";

export const metadata: Metadata = { title: "Gmail connections" };

export default function GmailConnectionsPage() {
  // AD1/ZO5 will supply verified connection state. No provider data is simulated here.
  return <GmailConnectionsScreen state={{ status: "unavailable" }} />;
}

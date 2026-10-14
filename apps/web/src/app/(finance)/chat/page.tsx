import type { Metadata } from "next";
import { ChatRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Chat" };
export default function ChatPage() {
  return <ChatRoute />;
}

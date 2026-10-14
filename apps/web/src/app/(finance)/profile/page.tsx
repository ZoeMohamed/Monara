import type { Metadata } from "next";
import { ProfileRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Profile" };
export default function ProfilePage() {
  return <ProfileRoute />;
}

import type { Metadata } from "next";
import { OverviewRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Overview" };
export default function OverviewPage() {
  return <OverviewRoute />;
}

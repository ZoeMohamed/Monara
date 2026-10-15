import type { Metadata } from "next";
import { ReportsRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Reports" };
export default function DemoReportsPage() {
  return <ReportsRoute />;
}

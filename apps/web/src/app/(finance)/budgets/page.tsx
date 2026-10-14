import type { Metadata } from "next";
import { BudgetsRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Budgets" };
export default function BudgetsPage() {
  return <BudgetsRoute />;
}

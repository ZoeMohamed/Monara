import type { Metadata } from "next";
import { TransactionsRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "History" };
export default function DemoTransactionsPage() {
  return <TransactionsRoute />;
}

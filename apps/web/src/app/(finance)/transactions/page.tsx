import type { Metadata } from "next";
import { TransactionsRoute } from "@/components/app-route-views";

export const metadata: Metadata = { title: "Transactions" };
export default function TransactionsPage() {
  return <TransactionsRoute />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDeletionStatus } from "@/components/account-deletion-status";
import { deletionStatus } from "@/lib/auth/user-deletion";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account deletion",
  robots: { index: false, follow: false },
};

export default async function AccountDeletionPage() {
  if (await getAuthenticatedIdentity()) redirect("/");
  const status = await deletionStatus().catch(() => null);
  return <AccountDeletionStatus initialStatus={status} />;
}

import { redirect } from "next/navigation";

import { MonaraApp } from "@/components/monara-app";
import { profileFromIdentity } from "@/lib/auth/identity";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export default async function Home() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/sign-in?next=/");

  return <MonaraApp profile={profileFromIdentity(identity)} />;
}

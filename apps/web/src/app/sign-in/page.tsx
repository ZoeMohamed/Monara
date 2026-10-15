import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInScreen } from "@/components/sign-in-screen";
import { safeAuthenticatedNextPath, safeNextPath, signInErrorMessage } from "@/lib/auth/redirect";
import { availablePublicSupabaseConfig } from "@/lib/supabase/config";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const identity = await getAuthenticatedIdentity();
  if (identity) {
    redirect(safeAuthenticatedNextPath(typeof params.next === "string" ? params.next : null));
  }

  return (
    <SignInScreen
      available={availablePublicSupabaseConfig() !== null}
      error={signInErrorMessage(typeof params.error === "string" ? params.error : null)}
      next={next}
    />
  );
}

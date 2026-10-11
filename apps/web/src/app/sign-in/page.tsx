import type { Metadata } from "next";
import { SignInScreen } from "@/components/sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // ZO5 owns the authenticated sign-in service. Never simulate a successful session.
  return <SignInScreen onSignIn={null} />;
}

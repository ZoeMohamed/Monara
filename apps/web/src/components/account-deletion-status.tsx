"use client";

import { userDeletionStatusSchema } from "@monara/contracts";
import Link from "next/link";
import { useEffect, useReducer } from "react";
import { clearLocalUserState } from "@/lib/auth/local-user-state";

export function AccountDeletionStatus({
  initialStatus,
}: {
  initialStatus: "pending" | "complete" | null;
}) {
  const [state, update] = useReducer(
    (
      current: { status: typeof initialStatus; unavailable: boolean },
      patch: Partial<typeof current>,
    ) => ({ ...current, ...patch }),
    { status: initialStatus, unavailable: false },
  );
  useEffect(() => {
    try {
      clearLocalUserState(window.localStorage);
      clearLocalUserState(window.sessionStorage);
    } catch {
      /* Storage may be blocked. */
    }
    if (initialStatus !== "pending") return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch("/api/profile/deletion", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable.");
        const result = userDeletionStatusSchema.safeParse(await response.json());
        if (!result.success) throw new Error("Status unavailable.");
        if (disposed) return;
        update({ status: result.data.status, unavailable: false });
        if (result.data.status === "complete") return;
      } catch {
        if (disposed) return;
        update({ unavailable: true });
      }
      timeout = setTimeout(() => void poll(), 5_000);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [initialStatus]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {state.status === "complete"
          ? "Account deleted"
          : state.status === "pending"
            ? "Deletion in progress"
            : "Deletion status unavailable"}
      </h1>
      <p aria-live="polite" className="mt-4 text-sm leading-6 text-muted" role="status">
        {state.status === "complete"
          ? "Your Monara account and personal data have been removed. This cannot be undone. Signing in again creates a fresh account and starts setup from the beginning."
          : state.status === "pending"
            ? "Your account is blocked and your Monara records have been removed. We are finishing connection and chat cleanup. This continues automatically, even if you close this page."
            : "Open this page in the browser where you requested deletion. If you need help checking a request, contact support through our Privacy Policy."}
      </p>
      {state.unavailable && (
        <p className="mt-3 text-sm leading-6 text-muted" role="alert">
          We cannot check progress right now. We will try again when the connection is available.
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-muted">
        Original emails and messages already delivered through WhatsApp stay unchanged.
        Provider-held copies and backups follow their own retention rules.
      </p>
      {state.status === "complete" && (
        <Link
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
          href="/sign-in"
        >
          Back to sign in
        </Link>
      )}
      <Link
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent"
        href="/privacy"
      >
        Privacy Policy and support
      </Link>
    </main>
  );
}

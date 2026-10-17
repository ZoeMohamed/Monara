import Link from "next/link";
import type { ReactNode } from "react";

import { BackButton } from "@/components/back-button";
import { Logo } from "@/components/logo";

/** A plain public page for the legal text. The wording is still a placeholder. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-12">
      <Link aria-label="Monara home" href="/">
        <Logo />
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="font-extrabold text-2xl tracking-tight">{title}</h1>
        <p className="rounded-2xl bg-[var(--warning-soft)] px-4 py-3 text-sm">
          This page is a placeholder. The full text will be added here before launch.
        </p>
        {children}
      </div>
      <BackButton />
    </main>
  );
}

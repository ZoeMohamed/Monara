"use client";

import { Button, Card } from "@monara/ui";

import { Logo } from "@/components/logo";

type SignInScreenProps = {
  error?: string;
  next: string;
};

export function SignInScreen({ error, next }: SignInScreenProps) {
  return (
    <main className="mx-auto grid min-h-svh max-w-5xl items-center gap-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] lg:grid-cols-2 lg:px-10">
      <div>
        <div className="inline-flex items-center">
          <Logo />
        </div>
        <p className="mt-6 text-sm font-semibold text-accent">Your money, together.</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
          No more scattered spending.
        </h1>
        <p className="mt-3 max-w-md text-base leading-6 text-muted">
          Bring your everyday transactions into one place. Review what comes in, then make your next
          decision with confidence.
        </p>
      </div>
      <Card className="block gap-0 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <h2 className="text-2xl font-bold">Welcome to Monara</h2>
        <p className="mt-2 leading-7 text-muted">Sign in to your private finance space.</p>
        <form action="/auth/sign-in" method="post">
          <input name="next" type="hidden" value={next} />
          <Button className="mt-5 min-h-11 w-full" type="submit">
            Continue with Google
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted">
          Signing in does not give Monara access to Gmail. You choose which mailboxes to connect
          separately.
        </p>
      </Card>
    </main>
  );
}

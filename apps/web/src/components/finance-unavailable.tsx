"use client";

import { Button, Card } from "@monara/ui";
import { useRouter } from "next/navigation";

import { Logo } from "@/components/logo";

export function FinanceUnavailable({
  message = "Your records could not be loaded. Please try again.",
}: {
  message?: string;
}) {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="hidden lg:block">
        <Logo />
      </div>
      <Card className="gap-4 rounded-3xl border border-border p-6">
        <h1 className="text-xl font-bold">Your finance space is unavailable</h1>
        <p className="text-sm leading-6 text-muted" role="status">
          {message}
        </p>
        <Button className="min-h-11" onPress={() => router.refresh()}>
          Try again
        </Button>
        <form action="/auth/sign-out" method="post">
          <Button className="min-h-11 w-full" type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </Card>
    </main>
  );
}

"use client";

import { Button, Card } from "@monara/ui";
import { useId } from "react";

import { Icon } from "@/components/icon";

export function EmptyLedgerState({
  title = "No transactions this month",
  pendingCount,
  onAdd,
  onReview,
  onConnectGmail,
}: {
  title?: string;
  pendingCount: number;
  onAdd?: () => void;
  onReview?: () => void;
  onConnectGmail?: () => void;
}) {
  const headingId = useId();

  return (
    <Card
      aria-labelledby={headingId}
      className="mt-5 block gap-0 rounded-3xl border border-border bg-surface px-4 py-8 text-center sm:py-12"
    >
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="transactions" />
      </span>
      <h2 className="mt-4 text-lg font-bold tracking-[-0.03em]" id={headingId}>
        {title}
      </h2>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onAdd ? (
          <Button className="min-h-11 gap-2 rounded-full" onPress={onAdd}>
            <Icon className="h-4 w-4" name="plus" />
            Add transaction
          </Button>
        ) : null}
        {pendingCount > 0 && onReview ? (
          <Button className="min-h-11 rounded-full" onPress={onReview} variant="secondary">
            Review imports ({pendingCount})
          </Button>
        ) : onConnectGmail ? (
          <Button className="min-h-11 rounded-full" onPress={onConnectGmail} variant="secondary">
            Connect Gmail
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

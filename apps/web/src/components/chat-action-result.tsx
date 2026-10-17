"use client";

import type {
  DestructiveActionConfirmation,
  ReversibleActionReceipt,
  ReversibleResourceType,
  WebChatResponse,
} from "@monara/contracts";
import { Button } from "@monara/ui";
import { useEffect, useId, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

export type ChatReply = WebChatResponse & { refreshWarning?: string };

const resourceLabels: Record<ReversibleResourceType, string> = {
  transaction: "Transaction",
  budget: "Budget",
  recurring_bill: "Recurring bill",
  financial_account: "Financial account",
  category: "Category",
  reminder_preferences: "Reminder preferences",
};

function useExpired(expiresAt: string) {
  const [expired, setExpired] = useState(() => Date.parse(expiresAt) <= Date.now());
  useEffect(() => {
    let timer: number;
    const check = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) setExpired(true);
      else timer = window.setTimeout(check, Math.min(2_147_483_647, remaining));
    };
    check();
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return { expired, markExpired: () => setExpired(true) };
}

function UndoLastChange({
  receipt,
  sending,
  onUndo,
}: {
  receipt: ReversibleActionReceipt;
  sending: boolean;
  onUndo: () => void;
}) {
  const { expired, markExpired } = useExpired(receipt.undoExpiresAt);
  if (expired)
    return (
      <p className="mt-2 text-xs leading-5 text-muted">
        The undo window has closed. Open the record to make a correction.
      </p>
    );
  return (
    <Button
      className="mt-2 min-h-11 text-xs"
      isDisabled={sending}
      onPress={() => {
        if (Date.parse(receipt.undoExpiresAt) <= Date.now()) markExpired();
        else onUndo();
      }}
      variant="secondary"
    >
      Undo last change
    </Button>
  );
}

function ActionConfirmation({
  confirmation,
  active,
  sending,
  onAnswer,
}: {
  confirmation: DestructiveActionConfirmation;
  active: boolean;
  sending: boolean;
  onAnswer: (answer: "yes" | "no") => void;
}) {
  const { maskAmountText } = useAmountDisplay();
  const titleId = useId();
  const { expired, markExpired } = useExpired(confirmation.expiresAt);

  const answer = (value: "yes" | "no") => {
    if (!active || sending || expired) return;
    if (Date.parse(confirmation.expiresAt) <= Date.now()) {
      markExpired();
      return;
    }
    onAnswer(value);
  };

  return (
    <section aria-labelledby={titleId} className="mt-3 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-bold" id={titleId}>
        Confirm this change
      </h2>
      <p className="mt-1 break-words text-sm leading-6">{maskAmountText(confirmation.summary)}</p>
      {active && !expired ? (
        <>
          <p className="mt-1 text-xs leading-5 text-muted">Only this action will be confirmed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="min-h-11 flex-1"
              isDisabled={sending}
              onPress={() => answer("no")}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button className="min-h-11 flex-1" isDisabled={sending} onPress={() => answer("yes")}>
              {confirmation.action.startsWith("delete_") ? "Yes, delete" : "Yes, apply changes"}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted" role="status">
          {expired ? "Expired. Ask again to review this action." : "This request is closed."}
        </p>
      )}
    </section>
  );
}

export function ChatActionResult({
  result,
  activeConfirmationId,
  sending,
  onAnswer,
  onOpenResource,
  onUndoLastChange,
}: {
  result: ChatReply;
  activeConfirmationId: string | null;
  sending: boolean;
  onAnswer: (answer: "yes" | "no") => void;
  onOpenResource?: (type: ReversibleResourceType, id: string) => void;
  onUndoLastChange?: () => void;
}) {
  const lastAction = result.actions.at(-1);
  return (
    <>
      {result.actions.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-border p-3">
          <p className="text-xs font-bold text-muted">Saved changes</p>
          <ul className="mt-1 divide-y divide-separator">
            {result.actions.map((action) => (
              <li
                className="flex flex-wrap items-center justify-between gap-x-3 py-1"
                key={action.actionId}
              >
                <span className="text-sm">{resourceLabels[action.resourceType]} saved</span>
                {onOpenResource && ["transaction", "budget"].includes(action.resourceType) ? (
                  <Button
                    aria-label={`View saved ${resourceLabels[action.resourceType].toLowerCase()}`}
                    className="min-h-11 text-xs"
                    onPress={() => onOpenResource(action.resourceType, action.resourceId)}
                    variant="ghost"
                  >
                    View
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {lastAction && onUndoLastChange ? (
            <UndoLastChange
              key={lastAction.actionId}
              onUndo={onUndoLastChange}
              receipt={lastAction}
              sending={sending}
            />
          ) : null}
        </div>
      ) : null}
      {result.confirmation ? (
        <ActionConfirmation
          active={activeConfirmationId === result.confirmation.confirmationId}
          confirmation={result.confirmation}
          key={result.confirmation.confirmationId}
          onAnswer={onAnswer}
          sending={sending}
        />
      ) : null}
      {result.refreshWarning ? (
        <p
          className="mt-3 rounded-2xl bg-warning-soft p-3 text-sm leading-6 text-warning-soft-foreground"
          role="status"
        >
          {result.refreshWarning}
        </p>
      ) : null}
    </>
  );
}

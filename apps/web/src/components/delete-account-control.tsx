"use client";

import { USER_DELETION_PHRASE, userDeletionStatusSchema } from "@monara/contracts";
import { Button, Input, Label, TextField } from "@monara/ui";
import { useId, useReducer } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { leaveDeletedAccount } from "@/lib/auth/local-user-state";

type State = {
  open: boolean;
  confirmation: string;
  acknowledged: boolean;
  pending: boolean;
  error: string | null;
};
const initial: State = {
  open: false,
  confirmation: "",
  acknowledged: false,
  pending: false,
  error: null,
};

export function DeleteAccountControl({ online, setupKey }: { online: boolean; setupKey?: string }) {
  const [state, update] = useReducer(
    (current: State, patch: Partial<State>) => ({ ...current, ...patch }),
    initial,
  );
  const title = useId();
  const hint = useId();
  async function remove() {
    if (state.pending || state.confirmation !== USER_DELETION_PHRASE || !state.acknowledged) return;
    update({ pending: true, error: null });
    try {
      const response = await fetch("/api/profile/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: state.confirmation,
          acknowledged: state.acknowledged,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("Deletion was not confirmed.");
      const result = userDeletionStatusSchema.safeParse(await response.json().catch(() => null));
      if (!result.success) throw new Error("Deletion was not confirmed.");
      leaveDeletedAccount(setupKey);
    } catch {
      // Headers may have arrived before a connection failed. The status receipt
      // can confirm acceptance even though Auth cookies have already been cleared.
      try {
        const response = await fetch("/api/profile/deletion", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("No deletion receipt.");
        const result = userDeletionStatusSchema.safeParse(await response.json().catch(() => null));
        if (result.success) {
          leaveDeletedAccount(setupKey);
          return;
        }
      } catch {
        /* Preserve the explicit unknown outcome below. */
      }
      update({
        pending: false,
        error:
          "Deletion could not be confirmed. Try again to check. If it was accepted, cleanup continues even if you leave.",
      });
    }
  }
  return (
    <>
      <div className="min-w-0 py-3">
        <p className="text-sm font-semibold">Delete account</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Permanently remove your Monara account and personal data.
        </p>
        <Button
          className="mt-3 min-h-11"
          isDisabled={!online}
          onPress={() => update({ ...initial, open: true })}
          variant="danger-soft"
        >
          Delete account
        </Button>
        {!online && <p className="mt-2 text-xs text-muted">Reconnect to delete your account.</p>}
      </div>
      {state.open && (
        <ModalDialog
          labelledBy={title}
          onClose={() => {
            if (!state.pending) update(initial);
          }}
        >
          <div aria-busy={state.pending} className="p-6">
            <h2 className="text-xl font-bold" id={title}>
              Delete your account permanently?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              This removes your financial accounts, transactions, settings, chats, and connections
              from Monara. There is no undo or recovery period.
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Your Google account, original emails, and messages already delivered through WhatsApp
              stay unchanged.
            </p>
            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              <TextField
                isDisabled={state.pending}
                onChange={(confirmation) => update({ confirmation })}
                value={state.confirmation}
              >
                <Label>Type {USER_DELETION_PHRASE}</Label>
                <Input
                  aria-describedby={hint}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </TextField>
              <p className="mt-2 text-xs text-muted" id={hint}>
                Enter the phrase exactly as shown.
              </p>
              <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-6">
                <input
                  checked={state.acknowledged}
                  className="mt-1 h-5 w-5 shrink-0 accent-danger"
                  disabled={state.pending}
                  onChange={(event) => update({ acknowledged: event.target.checked })}
                  type="checkbox"
                />
                <span>
                  I understand that deleting my account permanently removes my Monara data and
                  cannot be undone.
                </span>
              </label>
              {state.error && (
                <p className="mt-3 text-sm leading-6 text-danger" role="alert">
                  {state.error}
                </p>
              )}
              <div className="mt-5 flex flex-col-reverse gap-2">
                <Button
                  className="min-h-11 w-full"
                  isDisabled={state.pending}
                  onPress={() => update(initial)}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  className="min-h-11 w-full"
                  isDisabled={
                    !online ||
                    state.pending ||
                    state.confirmation !== USER_DELETION_PHRASE ||
                    !state.acknowledged
                  }
                  type="submit"
                  variant="danger"
                >
                  {state.pending ? "Starting deletion…" : "Delete permanently"}
                </Button>
              </div>
            </form>
          </div>
        </ModalDialog>
      )}
    </>
  );
}

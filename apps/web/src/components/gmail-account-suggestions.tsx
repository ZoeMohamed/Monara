"use client";

import type { FinancialAccount, GmailAccountSuggestion, GmailDiscovery } from "@monara/contracts";
import { Button, Chip } from "@monara/ui";
import { useCallback, useEffect, useId, useState } from "react";

import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import {
  dismissGmailDiscovery,
  GmailClientError,
  loadGmailDiscovery,
  requestGmailDiscovery,
} from "@/lib/gmail/client";
import { accountInputFor, choiceFromSuggestion } from "@/lib/onboarding/banks";

/** How often the page checks on a running search. */
const DISCOVERY_POLL_MS = 3_000;

type View = {
  discovery: GmailDiscovery | null;
  accounts: FinancialAccount[];
  error: string | null;
  busyKey: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof FinanceClientError || error instanceof GmailClientError
    ? error.message
    : "That did not work. Try again.";
}

function SuggestionRow({
  suggestion,
  accounts,
  busy,
  onAdd,
  onLink,
  onDismiss,
}: {
  suggestion: GmailAccountSuggestion;
  accounts: FinancialAccount[];
  busy: boolean;
  onAdd: () => void;
  onLink: (account: FinancialAccount) => void;
  onDismiss: () => void;
}) {
  const selectId = useId();
  const linkable = accounts.filter((account) => account.institutionKey === null);
  const [chosen, setChosen] = useState("");
  const title =
    suggestion.name === suggestion.provider
      ? suggestion.name
      : `${suggestion.provider} · ${suggestion.name}`;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">{title}</p>
        {suggestion.linkedAccounts.length > 0 && (
          <Chip color="success" variant="soft">
            Linked
          </Chip>
        )}
        {suggestion.isNew && (
          <Chip color="accent" variant="soft">
            New
          </Chip>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {suggestion.emailCount} {suggestion.emailCount === 1 ? "email" : "emails"}
        {suggestion.lastFours.length > 0 ? ` · ending ${suggestion.lastFours.join(", ")}` : ""}
      </p>
      {suggestion.linkedAccounts.length > 0 ? (
        <p className="mt-1 text-sm text-muted">
          Imports go to {suggestion.linkedAccounts.map((account) => account.name).join(", ")}.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Button className="min-h-11" isDisabled={busy} onPress={onAdd}>
            Add account
          </Button>
          {linkable.length > 0 && (
            <>
              <label className="sr-only" htmlFor={selectId}>
                Link {title} to an existing account
              </label>
              <select
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
                disabled={busy}
                id={selectId}
                onChange={(event) => setChosen(event.target.value)}
                value={chosen}
              >
                <option value="">Link to existing…</option>
                {linkable.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <Button
                className="min-h-11"
                isDisabled={busy || !chosen}
                onPress={() => {
                  const account = linkable.find((candidate) => candidate.id === chosen);
                  if (account) onLink(account);
                }}
                variant="secondary"
              >
                Link
              </Button>
            </>
          )}
          {suggestion.isNew && (
            <Button className="min-h-11" isDisabled={busy} onPress={onDismiss} variant="ghost">
              Dismiss
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Banks, cards, and wallets that email this mailbox. Gmail sync reads only the
 * senders of the User's own accounts, so this is where accounts get added or linked.
 */
export function GmailAccountSuggestions({ connectionId }: { connectionId: string }) {
  const titleId = useId();
  const [view, setView] = useState<View>({
    discovery: null,
    accounts: [],
    error: null,
    busyKey: null,
  });

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const [discovery, accounts] = await Promise.all([
        loadGmailDiscovery(connectionId, { signal }),
        callFinanceOperation("list_financial_accounts", { limit: 100, isActive: true }),
      ]);
      if (!signal?.aborted) {
        setView((previous) => ({ ...previous, discovery, accounts: accounts.items, error: null }));
      }
    },
    [connectionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setView((previous) => ({ ...previous, error: errorMessage(error) }));
      }
    });
    return () => controller.abort();
  }, [reload]);

  const running = view.discovery?.state === "running";
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      // A failed check keeps the last known state; the next one tries again.
      reload(controller.signal).catch(() => undefined);
    }, DISCOVERY_POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [running, reload]);

  const act = async (busyKey: string, run: () => Promise<unknown>) => {
    setView((previous) => ({ ...previous, busyKey, error: null }));
    try {
      await run();
      await reload();
    } catch (error) {
      setView((previous) => ({ ...previous, error: errorMessage(error) }));
    } finally {
      setView((previous) => ({ ...previous, busyKey: null }));
    }
  };

  const search = () =>
    act("search", async () => {
      // The search runs before this answers, so its result shows at once.
      const discovery = await requestGmailDiscovery(connectionId);
      setView((previous) => ({ ...previous, discovery }));
    });

  const add = (suggestion: GmailAccountSuggestion) =>
    act(suggestion.institutionKey, () =>
      callFinanceOperation(
        "create_financial_account",
        // The account is fed by the mailbox it was found in.
        accountInputFor(choiceFromSuggestion(suggestion), crypto.randomUUID(), connectionId),
      ),
    );

  const link = (suggestion: GmailAccountSuggestion, account: FinancialAccount) =>
    act(suggestion.institutionKey, () =>
      callFinanceOperation("update_financial_account", {
        financialAccountId: account.id,
        expectedUpdatedAt: account.updatedAt,
        changes: { institutionKey: suggestion.institutionKey, gmailConnectionId: connectionId },
      }),
    );

  const dismiss = (suggestion: GmailAccountSuggestion) =>
    act(suggestion.institutionKey, () =>
      dismissGmailDiscovery(connectionId, suggestion.institutionKey),
    );

  const discovery = view.discovery;
  // Banks found since the mailbox was connected come first, where the Profile badge points.
  const suggestions = [...(discovery?.suggestions ?? [])].sort(
    (a, b) => Number(b.isNew) - Number(a.isNew),
  );
  return (
    <section aria-labelledby={titleId} className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-bold" id={titleId}>
        Banks and wallets in this Gmail
      </h3>
      {discovery === null && !view.error && (
        <p className="mt-2 text-sm text-muted">Loading suggestions…</p>
      )}
      {(running || view.busyKey === "search") && (
        <p role="status" className="mt-2 text-sm text-muted">
          Looking for bank and wallet emails…
        </p>
      )}
      {discovery?.state === "failed" && (
        <p role="alert" className="mt-2 text-sm text-danger">
          This mailbox could not be checked. Try again.
        </p>
      )}
      {discovery?.state === "completed" && suggestions.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          No bank or wallet emails from the last 30 days. Monara imports only emails from banks and
          wallets you add.
        </p>
      )}
      {suggestions.length > 0 && (
        <>
          <p className="mt-2 text-sm leading-6 text-muted">
            Monara imports only from banks and wallets you add or link here.
          </p>
          <ul className="divide-y divide-separator">
            {suggestions.map((suggestion) => (
              <SuggestionRow
                accounts={view.accounts}
                busy={view.busyKey !== null}
                key={suggestion.institutionKey}
                onAdd={() => void add(suggestion)}
                onDismiss={() => void dismiss(suggestion)}
                onLink={(account) => void link(suggestion, account)}
                suggestion={suggestion}
              />
            ))}
          </ul>
        </>
      )}
      {view.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {view.error}
        </p>
      )}
      {discovery !== null && !running && (
        <Button
          className="mt-3 min-h-11"
          isDisabled={view.busyKey !== null}
          onPress={() => void search()}
          variant="secondary"
        >
          {discovery.state === "idle" ? "Find banks and wallets" : "Search again"}
        </Button>
      )}
    </section>
  );
}

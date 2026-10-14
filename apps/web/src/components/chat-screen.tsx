"use client";

import { Button, Card, InputGroup, Label, Spinner, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";

import { Icon } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";

type ChatMessage = { id: string; role: "user" | "agent" | "error"; text: string };

// Prompts mirror the PRD scenarios so a demo can run them from the web (F11).
const suggestions: { text: string; hint: string }[] = [
  { text: "coffee 28k", hint: "Log an expense" },
  { text: "How much did I spend on food this month?", hint: "Ask about spending" },
  { text: "Can I afford a 300k dinner?", hint: "Check your budget" },
  { text: "What bills are due this week?", hint: "See upcoming bills" },
];

export function ChatScreen({ onSend }: { onSend: (text: string) => Promise<string> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text }]);
    setSending(true);
    try {
      const reply = await onSend(text);
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text: reply }]);
      setDraft("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The Agent didn't respond.";
      setMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), role: "error", text: `${reason} Nothing was changed.` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col lg:min-h-[calc(100dvh-12rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Chat</h1>
        <span className="text-xs font-medium text-muted">Agent not connected</span>
      </div>

      <div aria-label="Conversation" aria-live="polite" className="mt-4 flex-1" role="log">
        {messages.length === 0 ? (
          <Card className="block gap-0 overflow-hidden rounded-2xl border border-border p-0">
            <Card.Content className="block px-4 py-5 sm:px-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <MonaraMascot className="h-16 w-16" />
                <h2 className="text-lg font-semibold tracking-[-0.025em]">Ask about your money</h2>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
                Once connected, Monara will answer from your confirmed records. Messages won&apos;t
                change anything yet.
              </p>
            </Card.Content>
            <ul className="divide-y divide-separator border-t border-separator">
              {suggestions.map((suggestion) => (
                <li key={suggestion.text}>
                  <button
                    className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100 hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus active:bg-surface-secondary sm:px-6"
                    onClick={() => setDraft(suggestion.text)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-5">{suggestion.text}</span>
                      <span className="mt-1 block text-xs text-muted">{suggestion.hint}</span>
                    </span>
                    <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <ol className="space-y-2">
            {messages.map((message) => (
              <li
                className={`motion-safe:animate-[rise-in_260ms_var(--ease-out)_both] ${
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                    : message.role === "error"
                      ? "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-danger-soft px-3.5 py-2 text-sm text-danger-soft-foreground"
                      : "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface-secondary px-3.5 py-2 text-sm"
                }`}
                key={message.id}
              >
                <span className="sr-only">
                  {message.role === "user"
                    ? "You: "
                    : message.role === "error"
                      ? "Error: "
                      : "Monara: "}
                </span>
                <span className="break-words whitespace-pre-wrap">{message.text}</span>
              </li>
            ))}
            {sending ? (
              <li className="flex w-fit items-center gap-2 rounded-2xl bg-surface-secondary px-3.5 py-2 text-sm text-muted">
                <Spinner aria-hidden size="sm" />
                Sending…
              </li>
            ) : null}
          </ol>
        )}
      </div>

      <form
        className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] mt-3 bg-background pt-2 pb-1 lg:bottom-4"
        onSubmit={send}
      >
        <div className="flex items-center gap-2">
          <TextField
            className="min-w-0 flex-1"
            isDisabled={sending}
            onChange={setDraft}
            value={draft}
          >
            <Label className="sr-only">Message Monara</Label>
            <InputGroup className="rounded-2xl">
              <InputGroup.Input
                autoComplete="off"
                className="text-base"
                enterKeyHint="send"
                placeholder="Message Monara"
              />
            </InputGroup>
          </TextField>
          <Button
            aria-label="Send message"
            className="rounded-2xl"
            isDisabled={sending || draft.trim() === ""}
            isIconOnly
            type="submit"
          >
            <Icon className="h-5 w-5" name="send" strokeWidth={2.2} />
          </Button>
        </div>
      </form>
    </div>
  );
}

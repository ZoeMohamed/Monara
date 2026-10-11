"use client";

import { Button, InputGroup, Label, Spinner, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";

import { Icon } from "@/components/icon";

type ChatMessage = { id: string; role: "user" | "agent" | "error"; text: string };

// Prompts mirror the PRD scenarios so a demo can run them from the web (F11).
const suggestions = [
  "coffee 28k",
  "How much did I spend on food this month?",
  "Can I afford a 300k dinner?",
  "What bills are due this week?",
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
    setDraft("");
    setSending(true);
    try {
      const reply = await onSend(text);
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text: reply }]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The Agent didn't respond.";
      setDraft((current) => current || text);
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "error",
          text: `${reason} Your message is below for retry.`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col lg:min-h-[calc(100dvh-12rem)]">
      <p className="text-xs font-semibold text-muted sm:text-sm">Monara Agent</p>
      <h1 className="mt-0.5 text-2xl font-black tracking-[-0.05em] sm:text-4xl">Chat</h1>

      <div aria-label="Conversation" aria-live="polite" className="mt-3 flex-1" role="log">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm font-bold">Chat preview</p>
            <p className="mt-1 text-sm text-muted">
              The Agent is not connected yet. You can try the composer, but messages cannot read or
              change your records.
            </p>
            <p className="mt-3 text-xs font-semibold text-muted">Try</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  className="h-auto min-h-11 rounded-full px-3 py-2 text-left text-xs leading-4 whitespace-normal"
                  key={suggestion}
                  onPress={() => setDraft(suggestion)}
                  size="sm"
                  variant="secondary"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-2">
            {messages.map((message) => (
              <li
                className={
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                    : message.role === "error"
                      ? "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-danger-soft px-3.5 py-2 text-sm text-danger-soft-foreground"
                      : "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface-secondary px-3.5 py-2 text-sm"
                }
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
                Monara is working on it…
              </li>
            ) : null}
          </ol>
        )}
      </div>

      <form
        className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] mt-3 bg-background pt-2 pb-1 lg:bottom-4"
        onSubmit={send}
      >
        <div className="flex items-center gap-2">
          <TextField className="min-w-0 flex-1" onChange={setDraft} value={draft}>
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

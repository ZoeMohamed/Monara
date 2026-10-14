"use client";

import type { ReversibleResourceType } from "@monara/contracts";
import { Button, InputGroup, Label, Spinner, TextField } from "@monara/ui";
import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import { ChatActionResult, type ChatReply } from "@/components/chat-action-result";
import styles from "@/components/chat-screen.module.css";
import { DemoIndicator } from "@/components/demo-indicator";
import { Icon } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  result?: ChatReply;
};

// Prompts mirror the PRD scenarios so a demo can run them from the web (F11).
const suggestions = [
  "kopi 25rb",
  "Where did my money go?",
  "Can I afford a 300k dinner?",
  "What bills are due?",
];

export function ChatScreen({
  onSend,
  onClose,
  onNewChat,
  demo = false,
  initialPrompt = null,
  onPromptUsed,
  onOpenResource,
}: {
  onSend: (text: string) => Promise<string | ChatReply>;
  onClose: () => void;
  onNewChat?: () => void;
  demo?: boolean;
  initialPrompt?: string | null;
  onPromptUsed?: () => void;
  onOpenResource?: (type: ReversibleResourceType, id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptSent = useRef(false);
  const sendingRef = useRef(false);
  const latest = messages.at(-1);
  const activeConfirmationId =
    latest?.role === "agent" ? (latest.result?.confirmation?.confirmationId ?? null) : null;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const shell = shellRef.current;
    const main = shell?.closest<HTMLElement>("#main-content");
    const resize = () => {
      shell?.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
      main?.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      main?.style.removeProperty("--chat-viewport-height");
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !sending) return;
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages, sending]);

  const sendText = async (value: string, preserveDraft = false) => {
    const text = value.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text }]);
    if (!preserveDraft) setDraft("");
    setSending(true);
    try {
      const reply = await onSend(text);
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: typeof reply === "string" ? reply : reply.reply,
          ...(typeof reply === "string" ? {} : { result: reply }),
        },
      ]);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Monara didn't respond. Try again in a moment.";
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "error", text: reason }]);
      if (!preserveDraft) setDraft(text);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendText(draft);
  };

  // A prompt chosen on Home is sent once, as if typed. The send itself is an
  // event, not part of the Effect, so it never re-runs when its inputs change.
  const sendPrompt = useEffectEvent((prompt: string) => {
    onPromptUsed?.();
    void sendText(prompt);
  });
  useEffect(() => {
    if (!initialPrompt || promptSent.current) return;
    promptSent.current = true;
    sendPrompt(initialPrompt);
  }, [initialPrompt]);

  return (
    <div className={`${styles.shell} flex flex-col`} ref={shellRef}>
      <div aria-hidden className={styles.handle} />
      <div className={styles.header}>
        <h1 className="font-extrabold">Ask Monara</h1>
        {demo ? (
          <DemoIndicator
            className={`${styles.connectionStatus} text-xs font-medium text-muted lg:hidden`}
          />
        ) : null}
        <div className={styles.headerActions}>
          {onNewChat && messages.length > 0 ? (
            <Button
              aria-label="New chat"
              className={styles.iconButton}
              isIconOnly
              onPress={onNewChat}
              variant="ghost"
            >
              <Icon className="h-5 w-5" name="compose" />
            </Button>
          ) : null}
          <Button
            aria-label="Close chat"
            className={styles.closeButton}
            isIconOnly
            onPress={onClose}
            variant="secondary"
          >
            <Icon className="h-5 w-5" name="close" />
          </Button>
        </div>
      </div>

      <div
        aria-label="Conversation"
        aria-live="polite"
        className={`${styles.conversation} flex-1`}
        ref={conversationRef}
        role="log"
      >
        {messages.length === 0 ? (
          <div className={styles.intro}>
            <div className={styles.introHeading}>
              <MonaraMascot className="h-16 w-16 shrink-0" />
              <h2>Hey, I’m Monara.</h2>
            </div>
            <p>
              Ask how your month is going, or log a payment like “kopi 25rb”. Answers come from your
              confirmed records.
            </p>
            <ul aria-label="Suggestions" className={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    className={styles.suggestion}
                    onClick={() => void sendText(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-2">
            {messages.map((message) => (
              <li
                className={`${styles.message} motion-safe:animate-[rise-in_260ms_var(--ease-out)_both] ${
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                    : message.role === "error"
                      ? "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-danger-soft px-3.5 py-2 text-sm text-danger-soft-foreground"
                      : "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface-secondary px-3.5 py-2 text-sm"
                }`}
                data-role={message.role}
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
                {message.result ? (
                  <ChatActionResult
                    activeConfirmationId={activeConfirmationId}
                    onAnswer={(answer) => void sendText(answer, true)}
                    onOpenResource={onOpenResource}
                    result={message.result}
                    sending={sending}
                  />
                ) : null}
              </li>
            ))}
            {sending ? (
              <li className="flex w-fit items-center gap-2 rounded-2xl bg-surface-secondary px-3.5 py-2 text-sm text-muted">
                <Spinner aria-hidden size="sm" />
                Thinking…
              </li>
            ) : null}
          </ol>
        )}
      </div>

      <form className={styles.composer} onSubmit={send}>
        <div className={styles.composerControls}>
          <TextField
            className="min-w-0 flex-1"
            isDisabled={sending}
            onChange={setDraft}
            value={draft}
          >
            <Label className="sr-only">Message Monara</Label>
            <InputGroup className={styles.inputGroup}>
              <InputGroup.Input
                autoComplete="off"
                className={`${styles.input} text-base`}
                enterKeyHint="send"
                maxLength={4_000}
                placeholder="Ask anything about your money…"
                ref={inputRef}
              />
            </InputGroup>
          </TextField>
          <Button
            aria-label="Send message"
            className={styles.sendButton}
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

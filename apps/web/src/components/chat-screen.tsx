"use client";

import { chatReceiptRequestSchema, type ReversibleResourceType } from "@monara/contracts";
import { Button, InputGroup, Label, Spinner, TextField } from "@monara/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import { useAmountDisplay } from "@/components/app-session-context";
import { ChatActionResult, type ChatReply } from "@/components/chat-action-result";
import { ChatHistory } from "@/components/chat-history";
import { ChatReceiptPreview } from "@/components/chat-receipt-preview";
import styles from "@/components/chat-screen.module.css";
import { useChatSession } from "@/components/chat-session-context";
import { ChatVisual } from "@/components/chat-visual";
import { DemoIndicator } from "@/components/demo-indicator";
import { Icon } from "@/components/icon";
import { MonaraMascot } from "@/components/monara-mascot";
import { useChatReceipt } from "@/components/use-chat-receipt";
import type { ChatReceiptSubmission } from "@/lib/chat/receipts";
import {
  type ChatConversation,
  type ChatMessage,
  type ChatRecovery,
  chatRecoveryForFailure,
} from "@/lib/chat/session";

const suggestions = [
  "kopi 25rb",
  "Summarize my spending this week",
  "Visualize my spending",
  "Can I afford a 300k dinner?",
];

type ChatScreenProps = {
  messages: ChatMessage[];
  conversations: ChatConversation[];
  activeConversationId: string;
  pending: boolean;
  onSend: (text: string) => Promise<string | ChatReply>;
  onSendReceipt?: (submission: ChatReceiptSubmission) => Promise<string | ChatReply>;
  onClose: () => void;
  onNewChat?: () => void;
  onRestoreConversation: (id: string) => void;
  onAddManually?: () => void;
  onCheckRecords?: () => void;
  demo?: boolean;
  initialPrompt?: string | null;
  onPromptUsed?: () => void;
  onOpenResource?: (type: ReversibleResourceType, id: string) => void;
  /** A saved chat is fetched when it is opened; the composer waits until it is ready. */
  status?: "ready" | "loading" | "failed";
  onRetryLoad?: () => void;
  /** Chats are kept in the User's account. False in the demo, which keeps them in the page. */
  saved?: boolean;
  savedLoadFailed?: boolean;
  onRetrySavedList?: () => void;
};

function ConversationMessage({
  message,
  activeConfirmationId,
  sending,
  onAnswer,
  onOpenResource,
  onUndoLastChange,
}: {
  message: ChatMessage;
  activeConfirmationId: string | null;
  sending: boolean;
  onAnswer: (answer: "yes" | "no") => void;
  onOpenResource: ChatScreenProps["onOpenResource"];
  onUndoLastChange?: () => void;
}) {
  const { maskAmountText } = useAmountDisplay();
  const roleLabel = message.role === "user" ? "You" : message.role === "error" ? "Error" : "Monara";
  return (
    <li className={styles.message} data-role={message.role}>
      <span className="sr-only">{roleLabel}: </span>
      <span className="break-words whitespace-pre-wrap">{maskAmountText(message.text)}</span>
      {message.receiptName ? (
        <p className={styles.mediaNotice}>
          <Icon className="h-4 w-4" name="image" /> {maskAmountText(message.receiptName)}
        </p>
      ) : null}
      {message.result ? (
        <ChatActionResult
          activeConfirmationId={activeConfirmationId}
          onAnswer={onAnswer}
          onOpenResource={onOpenResource}
          onUndoLastChange={onUndoLastChange}
          result={message.result}
          sending={sending}
        />
      ) : null}
      {message.closedConfirmation ? (
        <p className={styles.mediaNotice}>
          This earlier request is closed. Ask again to review the change.
        </p>
      ) : null}
      {message.result?.visuals?.map((visual) => (
        <ChatVisual key={visual.id} visual={visual} />
      ))}
    </li>
  );
}

function ConversationBody({
  messages,
  status,
  busy,
  activeConfirmationId,
  onRetryLoad,
  onOpenResource,
  onSendText,
}: {
  messages: ChatMessage[];
  status: "ready" | "loading" | "failed";
  busy: boolean;
  activeConfirmationId: string | null;
  onRetryLoad?: () => void;
  onOpenResource: ChatScreenProps["onOpenResource"];
  onSendText: (text: string) => void;
}) {
  const latest = messages.at(-1);
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted" role="status">
        <Spinner aria-hidden size="sm" /> Loading your chat…
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className={styles.intro}>
        <p role="alert">Monara couldn’t load this chat. Check your connection and try again.</p>
        {onRetryLoad ? (
          <Button className="mt-3 min-h-11" onPress={onRetryLoad} variant="secondary">
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className={styles.intro}>
        <div className={styles.introHeading}>
          <MonaraMascot className="h-16 w-16 shrink-0" pose="hello" />
          <h2>Hey, I’m Monara.</h2>
        </div>
        <p>
          Need a quick money check? Ask for a summary, or drop a note like “kopi 25rb”. I’ll work
          from your confirmed records.
        </p>
      </div>
    );
  }
  return (
    <ol className={styles.messageList}>
      {messages.map((message) => (
        <ConversationMessage
          activeConfirmationId={activeConfirmationId}
          key={message.id}
          message={message}
          onAnswer={onSendText}
          onOpenResource={onOpenResource}
          onUndoLastChange={
            message.id === latest?.id ? () => onSendText("Undo my last change") : undefined
          }
          sending={busy}
        />
      ))}
    </ol>
  );
}

function ChatHeader({
  demo,
  sending,
  onHistory,
  onNewChat,
  onClose,
}: {
  demo: boolean;
  sending: boolean;
  onHistory: () => void;
  onNewChat?: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.header}>
      <h1 className="font-extrabold">Ask Monara</h1>
      {demo ? (
        <DemoIndicator
          className={`${styles.connectionStatus} text-xs font-medium text-muted lg:hidden`}
        />
      ) : null}
      <div className={styles.headerActions}>
        <Button
          aria-label="Chat history"
          className={styles.iconButton}
          isIconOnly
          onPress={onHistory}
          variant="ghost"
        >
          <Icon className="h-5 w-5" name="history" />
        </Button>
        {onNewChat ? (
          <Button
            aria-label="New chat"
            className={styles.iconButton}
            isDisabled={sending}
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
  );
}

function useChatViewport() {
  const shellRef = useRef<HTMLDivElement>(null);
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
  return shellRef;
}

function ReceiptComposerStatus({
  receipt,
  available,
  sending,
  onAddManually,
}: {
  receipt: ReturnType<typeof useChatReceipt>;
  available: boolean;
  sending: boolean;
  onAddManually?: () => void;
}) {
  return (
    <>
      {receipt.receipt ? (
        <ChatReceiptPreview
          available={available}
          onAddManually={onAddManually}
          onRemove={receipt.clear}
          onPreviewError={receipt.failPreview}
          receipt={receipt.receipt}
          sending={sending}
        />
      ) : null}
      {receipt.preparing ? (
        <p className={styles.mediaNotice} role="status">
          <Spinner aria-hidden size="sm" /> Preparing your photo…
        </p>
      ) : null}
      {receipt.error ? (
        <div
          className={`${styles.receiptError} flex items-start justify-between gap-2`}
          role="alert"
        >
          <p>{receipt.error}</p>
          <Button
            aria-label="Dismiss attachment message"
            className="shrink-0"
            isIconOnly
            onPress={() => receipt.setError(null)}
            variant="ghost"
          >
            <Icon className="h-4 w-4" name="close" />
          </Button>
        </div>
      ) : null}
    </>
  );
}

function RecoveryNotice({
  recovery,
  draft,
  onCheckRecords,
  onContinue,
}: {
  recovery: ChatRecovery | null;
  draft: string;
  onCheckRecords?: () => void;
  onContinue: () => void;
}) {
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState<{ draft: string; message: string } | null>(null);
  if (!recovery) return null;
  return (
    <div className={styles.recoveryNotice} role="status">
      <p>{recovery.message}</p>
      {recovery.signInRequired ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            className="min-h-11 text-xs"
            onPress={async () => {
              try {
                await navigator.clipboard.writeText(draft);
                setCopyStatus({ draft, message: "Message copied. You can sign in again." });
              } catch {
                setCopyStatus({
                  draft,
                  message:
                    "Copy didn’t work. Select your message below and copy it before leaving.",
                });
              }
            }}
            variant="secondary"
          >
            Copy draft
          </Button>
          <Button
            className="min-h-11 text-xs"
            onPress={() => router.push("/sign-in?next=/chat")}
            variant="ghost"
          >
            Sign in again
          </Button>
        </div>
      ) : null}
      {copyStatus?.draft === draft ? <p className="mt-2">{copyStatus.message}</p> : null}
      {recovery.requiresRecordCheck ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {onCheckRecords ? (
            <Button className="min-h-11 text-xs" onPress={onCheckRecords} variant="secondary">
              Check History
            </Button>
          ) : null}
          {recovery.recordsOpened ? (
            <Button className="min-h-11 text-xs" onPress={onContinue} variant="ghost">
              I’ve checked, continue
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatComposer({
  draft,
  setDraft,
  sending,
  receipt,
  onSend,
  sendText,
  onFile,
  onAddManually,
  receiptAvailable,
  recovery,
  onCheckRecords,
  onContinue,
}: {
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  receipt: ReturnType<typeof useChatReceipt>;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  sendText: (value: string, preserveDraft: boolean) => Promise<void>;
  onFile: (file: File) => void;
  onAddManually?: () => void;
  receiptAvailable: boolean;
  recovery: ChatRecovery | null;
  onCheckRecords?: () => void;
  onContinue: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <form className={styles.composer} onSubmit={onSend}>
      <ReceiptComposerStatus
        available={receiptAvailable}
        onAddManually={onAddManually}
        receipt={receipt}
        sending={sending}
      />
      <RecoveryNotice
        draft={draft}
        recovery={recovery}
        onCheckRecords={onCheckRecords}
        onContinue={onContinue}
      />
      <ul aria-label="Prompt shortcuts" className={styles.suggestions}>
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <Button
              className={styles.suggestion}
              isDisabled={
                sending ||
                Boolean(receipt.receipt) ||
                recovery?.requiresRecordCheck ||
                recovery?.signInRequired
              }
              onPress={() => void sendText(suggestion, draft.trim() !== "")}
              type="button"
              variant="ghost"
            >
              {suggestion}
            </Button>
          </li>
        ))}
      </ul>
      <div className={styles.composerControls}>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose receipt image"
          className="sr-only"
          disabled={sending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onFile(file);
          }}
          ref={fileInput}
          tabIndex={-1}
          type="file"
        />
        <Button
          aria-label="Attach receipt or transaction screenshot"
          className={styles.attachButton}
          isDisabled={sending}
          isIconOnly
          onPress={() => fileInput.current?.click()}
          variant="ghost"
        >
          <Icon className="h-5 w-5" name="image" />
        </Button>
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
              placeholder={
                receipt.receipt
                  ? "Add a note, or just send the photo…"
                  : "Ask, or tell me what you spent…"
              }
            />
          </InputGroup>
        </TextField>
        <Button
          aria-label={
            receipt.receipt
              ? receiptAvailable
                ? "Send receipt"
                : "Receipt import unavailable"
              : "Send message"
          }
          className={styles.sendButton}
          isDisabled={
            sending ||
            recovery?.requiresRecordCheck ||
            recovery?.signInRequired ||
            (Boolean(receipt.receipt) && !receiptAvailable) ||
            (!receipt.receipt && draft.trim() === "")
          }
          isIconOnly
          type="submit"
        >
          <Icon className="h-5 w-5" name="send" strokeWidth={2.2} />
        </Button>
      </div>
    </form>
  );
}

function ChatHistorySaveNotice() {
  const { history } = useChatSession();
  if (!history.error && !history.notice) return null;
  return (
    <div
      className={`mx-4 mt-2 flex items-center gap-3 rounded-2xl p-3 text-xs ${history.error ? "bg-warning/10" : "bg-success/10"}`}
      role="status"
    >
      <p className="flex-1">{history.error ?? history.notice}</p>
      {history.error ? (
        <Button
          className="min-h-11 shrink-0"
          isDisabled={history.loading || history.saving}
          onPress={history.retry}
          variant="ghost"
        >
          Save history
        </Button>
      ) : (
        <Button
          aria-label="Dismiss history saved message"
          className="min-h-11 shrink-0"
          isIconOnly
          onPress={history.dismissNotice}
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      )}
    </div>
  );
}

export function ChatScreen({
  onSend,
  onSendReceipt,
  onClose,
  onNewChat,
  onRestoreConversation,
  onAddManually,
  onCheckRecords,
  demo = false,
  initialPrompt = null,
  onPromptUsed,
  onOpenResource,
  messages,
  conversations,
  activeConversationId,
  pending,
  status = "ready",
  onRetryLoad,
  saved = false,
  savedLoadFailed = false,
  onRetrySavedList,
}: ChatScreenProps) {
  const { dispatch } = useChatSession();
  const conversation = conversations.find((item) => item.id === activeConversationId);
  const draft = conversation?.draft ?? "";
  const recovery = conversation?.recovery ?? null;
  const setDraft = (value: string) => {
    dispatch({ type: "draft", id: activeConversationId, draft: value });
    if (recovery && !recovery.requiresRecordCheck && !recovery.signInRequired)
      dispatch({ type: "recovery", id: activeConversationId, recovery: null });
  };
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const receipt = useChatReceipt(activeConversationId);
  const shellRef = useChatViewport();
  const conversationRef = useRef<HTMLDivElement>(null);
  const promptSent = useRef(false);
  const sendingRef = useRef(false);
  const busy = sending || pending;
  const locked = busy || status !== "ready";
  const latest = messages.at(-1);
  const activeConfirmationId =
    latest?.role === "agent" ? (latest.result?.confirmation?.confirmationId ?? null) : null;
  useEffect(() => {
    if (messages.length === 0 && !busy) return;
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages, busy]);
  const sendText = async (value: string, preserveDraft = false) => {
    const text = value.trim();
    if (
      !text ||
      sendingRef.current ||
      pending ||
      status !== "ready" ||
      receipt.isPreparing() ||
      recovery?.requiresRecordCheck ||
      recovery?.signInRequired
    )
      return;
    sendingRef.current = true;
    if (!preserveDraft) setDraft("");
    setSending(true);
    try {
      await onSend(text);
      if (!receipt.receipt) receipt.setError(null);
    } catch (failure) {
      if (!preserveDraft) setDraft(text);
      dispatch({
        type: "recovery",
        id: activeConversationId,
        recovery: chatRecoveryForFailure(failure),
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const sendReceipt = async () => {
    if (
      !receipt.receipt ||
      sendingRef.current ||
      pending ||
      receipt.isPreparing() ||
      recovery?.requiresRecordCheck ||
      recovery?.signInRequired
    )
      return;
    if (!onSendReceipt) {
      receipt.setError(
        "Your photo hasn’t been sent. Receipt import isn’t connected yet. Add the transaction manually, or keep the photo here for now.",
      );
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      const request = chatReceiptRequestSchema.parse({
        attachment: receipt.receipt.attachment,
        text: draft,
      });
      await onSendReceipt({ ...request, file: receipt.receipt.file });
      receipt.clear();
      setDraft("");
    } catch (failure) {
      dispatch({
        type: "recovery",
        id: activeConversationId,
        recovery: chatRecoveryForFailure(failure),
      });
      receipt.setError(
        failure instanceof Error
          ? failure.message
          : "The receipt couldn’t be imported. Check your records before trying again.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (receipt.receipt) void sendReceipt();
    else void sendText(draft);
  };
  const sendPrompt = useEffectEvent((prompt: string) => {
    if (receipt.isPreparing() || recovery?.requiresRecordCheck || recovery?.signInRequired) {
      onPromptUsed?.();
      if (!draft.trim()) setDraft(prompt);
      return;
    }
    onPromptUsed?.();
    // A gated send would drop the prompt; keep it as a draft the user can send later.
    if (receipt.isPreparing() || recovery?.requiresRecordCheck || recovery?.signInRequired)
      setDraft(prompt);
    else void sendText(prompt);
  });
  useEffect(() => {
    if (!initialPrompt || promptSent.current || pending || status !== "ready") return;
    promptSent.current = true;
    sendPrompt(initialPrompt);
  }, [initialPrompt, pending, status]);
  return (
    <div className={`${styles.shell} flex flex-col`} ref={shellRef}>
      <div aria-hidden className={styles.handle} />
      <ChatHeader
        demo={demo}
        onClose={onClose}
        onHistory={() => setHistoryOpen(true)}
        onNewChat={onNewChat}
        sending={locked || receipt.preparing}
      />
      <ChatHistorySaveNotice />
      <div
        aria-label="Conversation"
        aria-live="polite"
        className={`${styles.conversation} flex-1`}
        ref={conversationRef}
        role="log"
      >
        <ConversationBody
          activeConfirmationId={activeConfirmationId}
          busy={busy}
          messages={messages}
          onOpenResource={onOpenResource}
          onRetryLoad={onRetryLoad}
          onSendText={(text) => void sendText(text, true)}
          status={status}
        />
        {busy ? (
          <div className="mt-2 flex w-fit items-center gap-2 rounded-2xl bg-surface-secondary px-3.5 py-2 text-sm text-muted">
            <Spinner aria-hidden size="sm" /> Working on it. Your reply will stay in this chat.
          </div>
        ) : null}
      </div>
      <ChatComposer
        draft={draft}
        onAddManually={onAddManually}
        onFile={(file) => void receipt.select(file)}
        onSend={send}
        onCheckRecords={
          onCheckRecords
            ? () => {
                if (recovery)
                  dispatch({
                    type: "recovery",
                    id: activeConversationId,
                    recovery: { ...recovery, recordsOpened: true },
                  });
                onCheckRecords();
              }
            : undefined
        }
        onContinue={() => dispatch({ type: "recovery", id: activeConversationId, recovery: null })}
        receipt={receipt}
        recovery={recovery}
        receiptAvailable={Boolean(onSendReceipt)}
        sending={locked || receipt.preparing}
        sendText={sendText}
        setDraft={setDraft}
      />
      {historyOpen ? (
        <ChatHistory
          activeId={activeConversationId}
          conversations={conversations}
          onClose={() => setHistoryOpen(false)}
          onNewChat={onNewChat}
          onRestore={onRestoreConversation}
          pending={busy || receipt.preparing}
          saved={saved}
          savedLoadFailed={savedLoadFailed}
          onRetrySavedList={onRetrySavedList}
        />
      ) : null}
    </div>
  );
}

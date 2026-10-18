"use client";

import { Button } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import styles from "@/components/chat-screen.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import type { ChatConversation } from "@/lib/chat/session";

function messageSummary(conversation: ChatConversation) {
  const count = conversation.loaded ? conversation.messages.length : conversation.messageCount;
  return count > 0 ? `${count} ${count === 1 ? "message" : "messages"}` : "Unsent draft";
}

export function ChatHistory({
  conversations,
  activeId,
  pending,
  onClose,
  onRestore,
  onNewChat,
  saved,
  savedLoadFailed,
}: {
  conversations: ChatConversation[];
  activeId: string;
  pending: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
  onNewChat?: () => void;
  saved: boolean;
  savedLoadFailed: boolean;
}) {
  const { maskAmountText } = useAmountDisplay();
  const recent = conversations
    .filter(
      (conversation) =>
        !conversation.loaded ||
        conversation.messages.length > 0 ||
        conversation.draft.trim() ||
        conversation.receipt,
    )
    .toSorted((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return (
    <ModalDialog labelledBy="chat-history-title" onClose={onClose}>
      <section className={styles.historyPanel}>
        <div className={styles.historyHeader}>
          <h2 id="chat-history-title">Your chats</h2>
          <Button aria-label="Close chat history" isIconOnly onPress={onClose} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        <p className={styles.historyNote}>
          {saved
            ? "Your chats are saved to your account. Drafts stay on this page, and reloading clears them."
            : "Chats and drafts stay here while this page is open. Reloading or signing out clears them."}
        </p>
        {savedLoadFailed ? (
          <p className={styles.historyNote} role="alert">
            Your saved chats couldn’t be loaded. Close and reopen Ask Monara to try again.
          </p>
        ) : null}
        {onNewChat ? (
          <Button
            className="mt-4 min-h-11 w-full rounded-full"
            isDisabled={pending}
            onPress={() => {
              onNewChat();
              onClose();
            }}
          >
            <Icon className="h-4 w-4" name="compose" /> New chat
          </Button>
        ) : null}
        {pending ? (
          <p className={styles.historyNote} role="status">
            Finishing your message. You can switch chats when it’s done.
          </p>
        ) : null}
        {recent.length === 0 ? (
          <p className={styles.historyEmpty}>Your conversations will appear here.</p>
        ) : (
          <ul className={styles.historyList}>
            {recent.map((conversation) => (
              <li key={conversation.id}>
                <Button
                  aria-current={conversation.id === activeId ? "true" : undefined}
                  className={styles.historyItem}
                  isDisabled={pending}
                  onPress={() => {
                    onRestore(conversation.id);
                    onClose();
                  }}
                  variant="ghost"
                >
                  <Icon className="h-4 w-4 shrink-0" name="chat" />
                  <span>
                    <strong>
                      {maskAmountText(
                        !conversation.loaded || conversation.messages.length > 0
                          ? conversation.title
                          : conversation.draft.trim() || "Receipt draft",
                      )}
                    </strong>
                    <small>
                      {messageSummary(conversation)}
                      {conversation.id === activeId ? " · Current" : ""}
                    </small>
                  </span>
                  <Icon className="h-4 w-4 shrink-0" name="chevron-right" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ModalDialog>
  );
}

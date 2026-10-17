"use client";

import { Button } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import styles from "@/components/chat-screen.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import type { ChatConversation } from "@/lib/chat/session";

export function ChatHistory({
  conversations,
  activeId,
  pending,
  onClose,
  onRestore,
  onNewChat,
}: {
  conversations: ChatConversation[];
  activeId: string;
  pending: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
  onNewChat?: () => void;
}) {
  const { maskAmountText } = useAmountDisplay();
  const recent = conversations
    .filter(
      (conversation) =>
        conversation.messages.length > 0 || conversation.draft.trim() || conversation.receipt,
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
          Chats and drafts stay here while this page is open. Reloading or signing out clears them.
        </p>
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
                        conversation.messages.length > 0
                          ? conversation.title
                          : conversation.draft.trim() || "Receipt draft",
                      )}
                    </strong>
                    <small>
                      {conversation.messages.length > 0
                        ? `${conversation.messages.length} ${conversation.messages.length === 1 ? "message" : "messages"}`
                        : "Unsent draft"}
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

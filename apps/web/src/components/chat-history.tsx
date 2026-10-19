"use client";

import { Button } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import styles from "@/components/chat-screen.module.css";
import { useChatSession } from "@/components/chat-session-context";
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
  onRetrySavedList,
}: {
  conversations: ChatConversation[];
  activeId: string;
  pending: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
  onNewChat?: () => void;
  saved: boolean;
  savedLoadFailed: boolean;
  onRetrySavedList?: () => void;
}) {
  const { maskAmountText } = useAmountDisplay();
  const { history } = useChatSession();
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
            ? "Your chats are saved privately to your account. Unsent drafts and photos stay on this page."
            : "Demo chats stay here while this page is open. Reloading clears them."}
        </p>
        {savedLoadFailed ? (
          <div className="mt-3 rounded-2xl bg-warning/10 p-4 text-sm" role="status">
            <p>Your saved chats couldn’t be loaded. Your current chat and drafts are still here.</p>
            <Button className="mt-2 min-h-11" onPress={onRetrySavedList} variant="secondary">
              Load saved chats
            </Button>
          </div>
        ) : null}
        {history.error ? (
          <div className="mt-3 rounded-2xl bg-warning/10 p-4 text-sm" role="status">
            <p>{history.error}</p>
            <Button
              className="mt-2 min-h-11"
              isDisabled={history.loading || history.saving}
              onPress={history.retry}
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        ) : null}
        {history.copyRequired && history.notice ? (
          <div
            className="mt-3 flex items-center gap-3 rounded-2xl bg-warning/10 p-4 text-sm"
            role="status"
          >
            <p className="flex-1">{history.notice}</p>
            <Button
              aria-label="Dismiss unsaved reply warning"
              className="min-h-11 shrink-0"
              isIconOnly
              onPress={history.dismissNotice}
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </div>
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
            {history.loading
              ? "Loading your saved chats. You can switch chats when they’re ready."
              : "Finishing your message. You can switch chats when it’s done."}
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
        {history.persistent && recent.length >= 50 ? (
          <p className={styles.historyNote}>Your 50 most recent chats are shown.</p>
        ) : null}
      </section>
    </ModalDialog>
  );
}

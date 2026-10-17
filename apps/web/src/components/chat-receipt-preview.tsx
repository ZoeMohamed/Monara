"use client";

import { Button } from "@monara/ui";
import Image from "next/image";
import { useAmountDisplay, useAppSession } from "@/components/app-session-context";
import styles from "@/components/chat-screen.module.css";
import { Icon } from "@/components/icon";
import type { ChatReceiptSubmission } from "@/lib/chat/receipts";

export function ChatReceiptPreview({
  receipt,
  available,
  sending,
  onRemove,
  onAddManually,
  onPreviewError,
}: {
  receipt: ChatReceiptSubmission & { previewUrl: string };
  available: boolean;
  sending: boolean;
  onRemove: () => void;
  onAddManually?: () => void;
  onPreviewError: () => void;
}) {
  const { amountsHidden } = useAppSession();
  const { maskAmountText } = useAmountDisplay();
  return (
    <div className={styles.receiptPreview}>
      <div className={styles.receiptDetails}>
        {amountsHidden ? (
          <span className={`${styles.receiptImage} grid place-items-center bg-surface`}>
            <Icon className="h-5 w-5" name="eye-off" />
            <span className="sr-only">Receipt preview hidden while amounts are private.</span>
          </span>
        ) : (
          <Image
            alt="Selected receipt preview"
            className={styles.receiptImage}
            height={60}
            onError={onPreviewError}
            src={receipt.previewUrl}
            unoptimized
            width={60}
          />
        )}
        <div>
          <strong>{maskAmountText(receipt.attachment.name)}</strong>
          <p>
            {available
              ? "Image only? We’ll treat it as a transaction."
              : "Receipt import isn’t connected yet."}
          </p>
          {available ? (
            <p>Unclear details will need your review.</p>
          ) : (
            <p>Your photo stays in this chat.</p>
          )}
        </div>
        <Button
          aria-label="Remove receipt"
          className="shrink-0"
          isDisabled={sending}
          isIconOnly
          onPress={onRemove}
          variant="ghost"
        >
          <Icon className="h-4 w-4" name="close" />
        </Button>
      </div>
      {!available && onAddManually ? (
        <Button
          className="mt-2 min-h-11 rounded-full text-xs"
          isDisabled={sending}
          onPress={onAddManually}
          variant="secondary"
        >
          <Icon className="h-4 w-4" name="plus" /> Add transaction manually
        </Button>
      ) : null}
    </div>
  );
}

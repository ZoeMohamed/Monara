"use client";

import { chatReceiptMaxBytes } from "@monara/contracts";
import { useEffect, useRef, useState } from "react";
import { useChatSession } from "@/components/chat-session-context";
import { type ChatReceiptSubmission, prepareChatReceipt } from "@/lib/chat/receipts";

function readReceiptPreview(reader: FileReader, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    reader.onerror = () => reject(new Error("That image couldn’t be opened."));
    reader.onabort = () => reject(new Error("Image selection cancelled."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That image couldn’t be opened."));
    reader.readAsDataURL(file);
  });
}

/** Bounded previews stay in page-session memory; pending reads stop when the composer leaves. */
export function useChatReceipt(conversationId: string) {
  const { state, dispatch } = useChatSession();
  const receipt = state.conversations.find((item) => item.id === conversationId)?.receipt ?? null;
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const previewReader = useRef<FileReader | null>(null);
  const version = useRef(0);
  const preparingRef = useRef(false);
  const setReceipt = (selection: (ChatReceiptSubmission & { previewUrl: string }) | null) =>
    dispatch({ type: "receipt", id: conversationId, receipt: selection });
  useEffect(
    () => () => {
      version.current += 1;
      previewReader.current?.abort();
    },
    [],
  );
  const clear = () => {
    version.current += 1;
    previewReader.current?.abort();
    previewReader.current = null;
    setReceipt(null);
    setError(null);
    setPreparing(false);
    preparingRef.current = false;
  };
  const select = async (file: File) => {
    const current = ++version.current;
    previewReader.current?.abort();
    setReceipt(null);
    setError(null);
    setPreparing(true);
    preparingRef.current = true;
    try {
      const submission = await prepareChatReceipt(file, crypto.randomUUID());
      if (current !== version.current) return;
      const attachedBytes = state.conversations.reduce(
        (total, conversation) =>
          total +
          (conversation.id === conversationId
            ? 0
            : (conversation.receipt?.attachment.sizeBytes ?? 0)),
        0,
      );
      if (attachedBytes + file.size > chatReceiptMaxBytes)
        throw new Error(
          "Your receipt drafts have reached 10 MB. Send or remove a photo in another chat, or choose a smaller image.",
        );
      const reader = new FileReader();
      previewReader.current = reader;
      const previewUrl = await readReceiptPreview(reader, file);
      if (current !== version.current) return;
      previewReader.current = null;
      setReceipt({ ...submission, previewUrl });
    } catch (failure) {
      if (current === version.current)
        setError(
          `${failure instanceof Error ? failure.message : "That image couldn’t be opened."} No receipt is attached.`,
        );
    } finally {
      if (current === version.current) {
        previewReader.current = null;
        preparingRef.current = false;
        setPreparing(false);
      }
    }
  };
  const failPreview = () => {
    clear();
    setError("That image couldn’t be opened. No receipt is attached. Choose another photo.");
  };
  return {
    receipt,
    error,
    preparing,
    isPreparing: () => preparingRef.current,
    setError,
    clear,
    select,
    failPreview,
  };
}

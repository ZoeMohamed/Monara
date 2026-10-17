"use client";

import { type ChatVisualAttachment, chatVisualAttachmentSchema } from "@monara/contracts";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAppSession } from "@/components/app-session-context";
import styles from "@/components/chat-screen.module.css";
import { isExpectedChatVisualUrl } from "@/lib/chat/visuals";

export function ChatVisual({ visual }: { visual: ChatVisualAttachment }) {
  const { amountsHidden } = useAppSession();
  const parsed = chatVisualAttachmentSchema.safeParse(visual);
  const expectedOrigin = isExpectedChatVisualUrl(visual.url, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [unavailable, setUnavailable] = useState(
    () => !parsed.success || !expectedOrigin || Date.parse(visual.expiresAt) <= Date.now(),
  );
  useEffect(() => {
    if (!parsed.success) return;
    const timer = window.setTimeout(
      () => setUnavailable(true),
      Math.min(2_147_483_647, Math.max(0, Date.parse(visual.expiresAt) - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [parsed.success, visual.expiresAt]);
  if (amountsHidden)
    return <p className={styles.mediaNotice}>Spending visual hidden while amounts are private.</p>;
  if (!parsed.success || !expectedOrigin || unavailable)
    return (
      <p className={styles.mediaNotice}>
        This visual is no longer available. Ask Monara to make a fresh one.
      </p>
    );
  return (
    <figure className={styles.visual}>
      <Image
        alt={visual.alt}
        height={visual.height}
        onError={() => setUnavailable(true)}
        referrerPolicy="no-referrer"
        src={visual.url}
        unoptimized
        width={visual.width}
      />
      <figcaption>{visual.title}</figcaption>
    </figure>
  );
}

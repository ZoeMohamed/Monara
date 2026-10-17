"use client";

import { useRouter } from "next/navigation";

/** Returns to wherever the page was opened from, such as Profile or its demo twin. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      className="self-start font-bold text-[var(--accent)] text-sm underline"
      onClick={() => router.back()}
      type="button"
    >
      Back
    </button>
  );
}

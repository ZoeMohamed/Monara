"use client";

import type { ReactNode } from "react";

type ModalDialogProps = {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
};

// Mount it while the modal is open. Mark one child with data-autofocus to receive initial focus.
export function ModalDialog({ labelledBy, onClose, children }: ModalDialogProps) {
  return (
    <dialog
      aria-labelledby={labelledBy}
      className="m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-3 backdrop:bg-[#10271fb3] backdrop:backdrop-blur-sm open:grid open:place-items-end sm:open:place-items-center"
      onClose={onClose}
      ref={(node) => {
        if (!node || node.open) return;
        node.showModal();
        node.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      }}
    >
      <div className="relative z-10 w-full max-w-md">{children}</div>
      <button
        aria-label="Tutup"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
    </dialog>
  );
}

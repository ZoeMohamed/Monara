"use client";

import { Modal } from "@monara/ui";
import type { ReactNode } from "react";

type ModalDialogProps = {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
};

// Mount while open; HeroUI contains focus and restores it to the opening control.
export function ModalDialog({ labelledBy, onClose, children, size = "md" }: ModalDialogProps) {
  return (
    <Modal.Backdrop
      className="backdrop-blur-sm"
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      variant="blur"
    >
      <Modal.Container
        className="p-3 pt-[max(.75rem,env(safe-area-inset-top,0px))] pb-[max(.75rem,env(safe-area-inset-bottom,0px))] pl-[max(.75rem,env(safe-area-inset-left,0px))] pr-[max(.75rem,env(safe-area-inset-right,0px))]"
        placement="auto"
        scroll="inside"
        size={size}
      >
        <Modal.Dialog
          aria-labelledby={labelledBy}
          className="max-h-full overflow-y-auto overscroll-contain rounded-[1.75rem] p-0"
        >
          {children}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

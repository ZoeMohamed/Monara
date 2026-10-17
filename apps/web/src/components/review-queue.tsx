"use client";

import { Button } from "@monara/ui";
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { TransactionRow } from "@/components/transaction-row";
import styles from "@/components/transactions-screen.module.css";
import { type Transaction, transactionErrors } from "@/data/demo-ledger";

export function ReviewRow({
  transaction,
  onOpen,
  onEdit,
  onConfirm,
}: {
  transaction: Transaction;
  onOpen: () => void;
  onEdit: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  // Exclusions need no account; everything else must name one before it can count.
  const ready =
    Object.keys(transactionErrors(transaction)).length === 0 &&
    (transaction.kind === "exclusion" || Boolean(transaction.method));
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const name = transaction.merchant || "transaction";
  return (
    <div className={styles.reviewRow}>
      <TransactionRow transaction={transaction} onClick={onOpen} />
      <Button
        aria-label={`${pending ? "Confirming" : ready ? "Confirm" : "Complete details for"} ${name}`}
        isDisabled={pending}
        className="min-h-11 min-w-11 rounded-full text-accent"
        isIconOnly
        onPress={ready ? () => void confirm() : onEdit}
        variant="ghost"
      >
        <Icon className="h-4 w-4" name={ready ? "check" : "compose"} />
      </Button>
    </div>
  );
}

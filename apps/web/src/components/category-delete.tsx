"use client";

import type { Category } from "@monara/contracts";
import { Button } from "@monara/ui";
import { useRef, useState } from "react";
import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { ModalDialog } from "@/components/modal-dialog";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

export function CategoryDelete({
  category,
  onClose,
  ...props
}: FinanceManagerProps & { category: Category; onClose: () => void }) {
  const [original] = useState(category);
  const inFlight = useRef(false);
  const [state, setState] = useState({ pending: false, error: null as string | null });
  const archived = props.snapshot.categories.some(
    (item) => item.id === original.id && item.isArchived,
  );
  const remove = async () => {
    if (inFlight.current || props.refreshRequired) return;
    inFlight.current = true;
    setState({ pending: true, error: null });
    try {
      await props.runMutation(() =>
        callFinanceOperation("update_category", {
          categoryId: original.id,
          expectedUpdatedAt: original.updatedAt,
          changes: { isArchived: true },
        }),
      );
      onClose();
    } catch (error) {
      setState({
        pending: false,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "The deletion result could not be verified. Refresh your records.",
      });
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <ModalDialog
      labelledBy="delete-category-title"
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
    >
      <div className={styles.form} aria-busy={state.pending}>
        <h2 className="text-xl font-bold" id="delete-category-title">
          {archived ? "Category deleted" : `Delete ${category.name}?`}
        </h2>
        <p className="text-sm leading-6 text-muted">
          This removes it from new category choices. Existing transactions and budgets keep their
          category.
        </p>
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        {props.refreshRequired && (
          <FinanceRecovery
            message="Refresh your records to check the result."
            onRefreshRecords={props.onRefreshRecords}
          />
        )}
        <div className={styles.footer}>
          <Button
            className="min-h-11"
            isDisabled={state.pending}
            onPress={onClose}
            variant="secondary"
          >
            {archived ? "Done" : "Keep category"}
          </Button>
          {!archived && (
            <Button
              className="min-h-11"
              isDisabled={state.pending || Boolean(props.refreshRequired)}
              onPress={remove}
              variant="danger"
            >
              {state.pending ? "Deleting…" : "Delete category"}
            </Button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

"use client";

import type { Category } from "@monara/contracts";
import { Button, FieldError, Input, Label, TextField } from "@monara/ui";
import { type FormEvent, useRef, useState } from "react";
import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { CategoryIconPicker } from "@/components/category-icon-picker";
import { CategoryKindField } from "@/components/category-kind-field";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { categoryIconChoice } from "@/data/category-icons";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type CategoryCreatorProps = FinanceManagerProps & {
  initialKind?: Category["kind"];
  onClose: () => void;
  onCreated?: (category: Category) => void;
};

function useCategoryCreation(props: CategoryCreatorProps) {
  const [state, setState] = useState({
    name: "",
    kind: props.initialKind ?? ("expense" as Category["kind"]),
    icon: null as string | null,
    pending: false,
    uncertain: false,
    error: null as string | null,
    fieldError: null as string | null,
  });
  const request = useRef<{
    clientRequestId: string;
    name: string;
    kind: Category["kind"];
    icon: string;
    color: string;
  } | null>(null);
  const inFlight = useRef(false);
  const found = props.snapshot.categories.find(
    (category) =>
      category.id === request.current?.clientRequestId &&
      category.name === request.current.name &&
      category.kind === request.current.kind &&
      category.icon === request.current.icon,
  );
  const locked = state.pending || state.uncertain || Boolean(props.refreshRequired);
  const close = () => {
    if (!inFlight.current) props.onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (inFlight.current || props.refreshRequired) return;
    if (!request.current) {
      const name = state.name.trim();
      if (name.length === 0 || name.length > 100) {
        setState((previous) => ({ ...previous, fieldError: "Use a name of 1 to 100 characters." }));
        return;
      }
      request.current = {
        name,
        kind: state.kind,
        icon: categoryIconChoice(name, state.icon),
        color: "#0b33fd",
        clientRequestId: crypto.randomUUID(),
      };
    }
    const submitted = request.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, fieldError: null }));
    try {
      const result = await props.runMutation(async () => {
        const response = await callFinanceOperation("create_category", submitted);
        if (
          response.category.id !== submitted.clientRequestId ||
          response.category.name !== submitted.name ||
          response.category.kind !== submitted.kind ||
          response.category.icon !== submitted.icon
        )
          throw new FinanceClientError(
            "DEPENDENCY_UNAVAILABLE",
            "The category result could not be verified. Refresh your records.",
            null,
            true,
          );
        return response;
      });
      props.onCreated?.(result.category);
      props.onClose();
    } catch (error) {
      const uncertain = !(error instanceof FinanceClientError) || error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "The category result could not be verified. Refresh your records.",
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const change = (patch: Partial<Pick<typeof state, "name" | "icon" | "kind">>) =>
    setState((previous) => ({ ...previous, ...patch, error: null, fieldError: null }));
  return { state, locked, close, submit, change, found };
}

export function CategoryCreator(props: CategoryCreatorProps) {
  const editor = useCategoryCreation(props);
  const { state } = editor;
  return (
    <ModalDialog labelledBy="create-category-title" onClose={editor.close}>
      <form className={styles.form} noValidate onSubmit={editor.submit} aria-busy={state.pending}>
        <div className={styles.header}>
          <h2 className="text-xl font-bold" id="create-category-title">
            New category
          </h2>
          <Button
            aria-label="Close new category"
            isDisabled={state.pending}
            isIconOnly
            onPress={editor.close}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {editor.found && state.uncertain ? (
          <>
            <p className="text-sm" role="status">
              This category now appears in your records.
            </p>
            <Button
              onPress={() => {
                if (editor.found) props.onCreated?.(editor.found);
                props.onClose();
              }}
            >
              Use category
            </Button>
          </>
        ) : (
          <CategoryCreationFields editor={editor} {...props} />
        )}
      </form>
    </ModalDialog>
  );
}

function CategoryCreationFields({
  editor,
  refreshRequired,
  onRefreshRecords,
  initialKind,
}: CategoryCreatorProps & { editor: ReturnType<typeof useCategoryCreation> }) {
  const { state } = editor;
  return (
    <>
      <TextField
        isDisabled={editor.locked}
        isInvalid={Boolean(state.fieldError)}
        name="name"
        onChange={(name) => editor.change({ name })}
        value={state.name}
      >
        <Label>Category name</Label>
        <Input
          autoFocus
          className="min-h-11 text-base"
          maxLength={100}
          placeholder="e.g. Pet care"
        />
        <FieldError>{state.fieldError}</FieldError>
      </TextField>
      <CategoryKindField
        value={state.kind}
        onChange={(kind) => editor.change({ kind })}
        disabled={editor.locked || Boolean(initialKind)}
      />
      <p className={styles.meta}>The category type stays fixed after creation.</p>
      <CategoryIconPicker
        disabled={editor.locked}
        name={state.name}
        onChange={(icon) => editor.change({ icon })}
        value={state.icon}
      />
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {(refreshRequired || state.uncertain) && (
        <FinanceRecovery
          message="Refresh your records before retrying this same category."
          onRefreshRecords={onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button
          className="min-h-11"
          isDisabled={state.pending}
          onPress={editor.close}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          className="min-h-11"
          isDisabled={state.pending || Boolean(refreshRequired)}
          type="submit"
        >
          {state.pending ? "Saving…" : state.uncertain ? "Retry same category" : "Create category"}
        </Button>
      </div>
    </>
  );
}

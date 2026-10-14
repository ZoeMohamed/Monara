"use client";

import {
  type Category,
  type UpdateCategoryInput,
  updateCategoryInputSchema,
} from "@monara/contracts";
import { Button } from "@monara/ui";
import { type FormEvent, useId, useRef, useState } from "react";

import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type RenameProps = FinanceManagerProps & { category: Category; onClose: () => void };

function useCategoryRename({ category, onClose, ...props }: RenameProps) {
  const original = useRef(category);
  const request = useRef<UpdateCategoryInput | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState({
    name: category.name,
    pending: false,
    uncertain: false,
    conflict: false,
    error: null as string | null,
    fieldError: null as string | null,
  });
  const current = props.snapshot.categories.find((item) => item.id === original.current.id);
  const versionChanged = current?.updatedAt !== original.current.updatedAt;
  const reconciled =
    state.uncertain && versionChanged && current?.name === request.current?.changes.name;
  const blocked = Boolean(props.refreshRequired) || versionChanged || state.conflict;
  const unchanged = state.name.trim() === original.current.name;
  const close = () => {
    if (!inFlight.current) onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || blocked || reconciled || unchanged) return;
    if (!request.current) {
      const parsed = updateCategoryInputSchema.safeParse({
        categoryId: original.current.id,
        expectedUpdatedAt: original.current.updatedAt,
        changes: { name: state.name.trim() },
      });
      if (!parsed.success) {
        setState((previous) => ({
          ...previous,
          fieldError: "Use a name of 1 to 100 characters.",
          error: null,
        }));
        return;
      }
      request.current = parsed.data;
    }
    const submitted = request.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, fieldError: null }));
    try {
      await props.runMutation(async () => {
        const result = await callFinanceOperation("update_category", submitted);
        if (
          result.category.id !== submitted.categoryId ||
          result.category.name !== submitted.changes.name
        ) {
          throw new FinanceClientError(
            "DEPENDENCY_UNAVAILABLE",
            "The rename result could not be verified. Refresh your records.",
            null,
            true,
          );
        }
        return result;
      });
      onClose();
    } catch (error) {
      const known = error instanceof FinanceClientError;
      const uncertain = !known || error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        conflict: known && error.code === "CONFLICT",
        error: known
          ? error.message
          : "The rename result could not be verified. Refresh your records.",
        fieldError: known ? (error.fieldErrors?.["changes.name"]?.[0] ?? null) : null,
      }));
    } finally {
      inFlight.current = false;
    }
  };
  return {
    state,
    submit,
    close,
    reconciled,
    stale: versionChanged || state.conflict,
    blocked,
    unchanged,
    locked: state.pending || state.uncertain || blocked,
    change: (name: string) =>
      setState((previous) => ({ ...previous, name, error: null, fieldError: null })),
  };
}

function RenameFields({
  editor,
  onRefreshRecords,
}: {
  editor: ReturnType<typeof useCategoryRename>;
  onRefreshRecords?: () => Promise<void>;
}) {
  const prefix = useId();
  const { state } = editor;
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${prefix}-name`}>
          Category name
        </label>
        <input
          aria-describedby={state.fieldError ? `${prefix}-error` : undefined}
          aria-invalid={Boolean(state.fieldError)}
          className={styles.input}
          disabled={editor.locked}
          id={`${prefix}-name`}
          maxLength={100}
          name="name"
          onChange={(event) => editor.change(event.target.value)}
          value={state.name}
        />
        {state.fieldError ? (
          <p className={styles.error} id={`${prefix}-error`}>
            {state.fieldError}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {editor.stale ? (
        <p className={styles.meta} role="status">
          This category changed while you were editing. Refresh, then close this form and try again.
        </p>
      ) : null}
      {editor.blocked || state.uncertain ? (
        <FinanceRecovery
          message="Check your records before retrying. A retry keeps the same name and reviewed version."
          onRefreshRecords={onRefreshRecords}
        />
      ) : null}
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
          isDisabled={state.pending || editor.blocked || editor.unchanged}
          type="submit"
        >
          {state.pending ? "Saving…" : state.uncertain ? "Retry rename" : "Save name"}
        </Button>
      </div>
    </>
  );
}

function CategoryRename(props: RenameProps) {
  const editor = useCategoryRename(props);
  const titleId = useId();
  return (
    <ModalDialog labelledBy={titleId} onClose={editor.close}>
      <form
        aria-busy={editor.state.pending}
        className={styles.form}
        noValidate
        onSubmit={editor.submit}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" id={titleId}>
            Rename category
          </h2>
          <Button
            aria-label="Close category form"
            isDisabled={editor.state.pending}
            isIconOnly
            onPress={editor.close}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {editor.reconciled ? (
          <>
            <p className="text-sm leading-6" role="status">
              The updated name now appears in your records.
            </p>
            <Button className="min-h-11" onPress={editor.close}>
              Done
            </Button>
          </>
        ) : (
          <RenameFields editor={editor} onRefreshRecords={props.onRefreshRecords} />
        )}
      </form>
    </ModalDialog>
  );
}

export function CategoryManager(props: FinanceManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const titleId = useId();
  const categories = props.snapshot.categories;
  const selected = categories.find((item) => item.id === selectedId);
  return (
    <section aria-labelledby={titleId} className={`${styles.item} mt-4`}>
      <h2 className="text-base font-bold" id={titleId}>
        Categories
      </h2>
      {categories.length === 0 ? (
        <p className={styles.meta}>No categories available.</p>
      ) : (
        <ul className="mt-2 divide-y divide-separator">
          {categories.map((category) => (
            <li className="flex min-h-14 items-center gap-3 py-2" key={category.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{category.name}</p>
                {category.isArchived ? <p className={styles.meta}>Archived</p> : null}
              </div>
              <Button
                aria-label={`Rename ${category.name} category`}
                className="min-h-11 shrink-0 rounded-full"
                isDisabled={Boolean(props.refreshRequired)}
                onPress={() => setSelectedId(category.id)}
                variant="ghost"
              >
                Rename
              </Button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <CategoryRename
          {...props}
          category={selected}
          key={selected.id}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </section>
  );
}

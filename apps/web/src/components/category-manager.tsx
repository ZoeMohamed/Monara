"use client";

import {
  type Category,
  type UpdateCategoryInput,
  updateCategoryInputSchema,
} from "@monara/contracts";
import { Button, FieldError, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import { type FormEvent, useId, useRef, useState } from "react";
import { type FinanceManagerProps, FinanceRecovery } from "@/components/budget-manager";
import styles from "@/components/budget-manager.module.css";
import { CategoryCreator } from "@/components/category-creator";
import { CategoryDelete } from "@/components/category-delete";
import { CategoryIconPicker } from "@/components/category-icon-picker";
import { CategoryKindField } from "@/components/category-kind-field";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { categoryIconChoice } from "@/data/category-icons";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type RenameProps = FinanceManagerProps & { category: Category; onClose: () => void };

function useCategoryRename({ category, onClose, ...props }: RenameProps) {
  const original = useRef(category);
  const request = useRef<UpdateCategoryInput | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState({
    name: category.name,
    icon: category.icon as string | null,
    pending: false,
    uncertain: false,
    conflict: false,
    error: null as string | null,
    fieldError: null as string | null,
  });
  const current = props.snapshot.categories.find((item) => item.id === original.current.id);
  const versionChanged = current?.updatedAt !== original.current.updatedAt;
  const reconciled =
    state.uncertain &&
    versionChanged &&
    current?.name === request.current?.changes.name &&
    current?.icon === request.current?.changes.icon;
  const blocked = Boolean(props.refreshRequired) || versionChanged || state.conflict;
  const unchanged =
    state.name.trim() === original.current.name &&
    categoryIconChoice(state.name, state.icon) ===
      categoryIconChoice(original.current.name, original.current.icon);
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
        changes: { name: state.name.trim(), icon: categoryIconChoice(state.name, state.icon) },
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
          result.category.name !== submitted.changes.name ||
          result.category.icon !== submitted.changes.icon
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
    changeIcon: (icon: string | null) => setState((previous) => ({ ...previous, icon })),
  };
}

function RenameFields({
  editor,
  onRefreshRecords,
}: {
  editor: ReturnType<typeof useCategoryRename>;
  onRefreshRecords?: () => Promise<void>;
}) {
  const { state } = editor;
  return (
    <>
      <TextField
        isDisabled={editor.locked}
        isInvalid={Boolean(state.fieldError)}
        name="name"
        onChange={editor.change}
        value={state.name}
      >
        <Label>Category name</Label>
        <Input className="min-h-11 text-base" maxLength={100} />
        <FieldError>{state.fieldError}</FieldError>
      </TextField>
      <CategoryIconPicker
        disabled={editor.locked}
        name={state.name}
        onChange={editor.changeIcon}
        value={state.icon}
      />
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
          {state.pending ? "Saving…" : state.uncertain ? "Retry same change" : "Save category"}
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
            Edit category
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
        <p className="text-sm capitalize text-muted">
          {props.category.kind} category · Type cannot be changed
        </p>
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

function CategoryManagementSelect({
  categories,
  selected,
  onSelect,
  onCreate,
  disabled,
  name,
}: {
  categories: Category[];
  selected?: Category;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <Select
      className="w-full"
      isDisabled={disabled}
      name={name}
      onChange={(value) => {
        if (value === "__create_category__") onCreate();
        else onSelect(value === null ? null : String(value));
      }}
      placeholder="Choose a category"
      value={selected?.id ?? null}
    >
      <Label>Manage categories</Label>
      <Select.Trigger className="min-h-11">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {categories.map((category) => (
            <ListBox.Item id={category.id} key={category.id} textValue={category.name}>
              <CategoryAvatar
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-secondary"
                icon={category.icon}
                iconClassName="h-4 w-4"
                name={category.name}
                size={28}
              />
              {category.name}
              <span className="ml-auto text-xs capitalize text-muted">{category.kind}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
          <ListBox.Item id="__create_category__" textValue="Create new category">
            <Icon className="h-4 w-4" name="plus" />
            Create new category…
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function CategoryActions({
  selected,
  onEdit,
  onDelete,
}: {
  selected?: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!selected) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button
        aria-label={`Edit ${selected.name} category`}
        className="min-h-11 rounded-full"
        onPress={onEdit}
        variant="secondary"
      >
        Edit
      </Button>
      <Button
        aria-label={`Delete ${selected.name} category`}
        className="min-h-11 rounded-full text-danger"
        onPress={onDelete}
        variant="ghost"
      >
        Delete
      </Button>
    </div>
  );
}

export function CategoryManager(props: FinanceManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const titleId = useId();
  const categories = props.snapshot.categories.filter((category) => !category.isArchived);
  const selected = categories.find((item) => item.id === selectedId);
  return (
    <section aria-labelledby={titleId} className={`${styles.item} mt-4`}>
      <div className={styles.header}>
        <h2 className="text-base font-bold" id={titleId}>
          Categories
        </h2>
      </div>
      <CategoryManagementSelect
        categories={categories}
        selected={selected}
        onSelect={setSelectedId}
        onCreate={() => setCreating(true)}
        disabled={Boolean(props.refreshRequired)}
        name="manageCategory"
      />
      <CategoryActions
        selected={selected}
        onEdit={() => setPanel("edit")}
        onDelete={() => setPanel("delete")}
      />
      {selected && panel === "edit" ? (
        <CategoryRename
          {...props}
          category={selected}
          key={selected.id}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {selected && panel === "delete" && (
        <CategoryDelete
          {...props}
          category={selected}
          key={selected.id}
          onClose={() => {
            setPanel(null);
            setSelectedId(null);
          }}
        />
      )}
      {creating && (
        <CategoryCreator
          {...props}
          onClose={() => setCreating(false)}
          onCreated={(category) => setSelectedId(category.id)}
        />
      )}
    </section>
  );
}

type DemoCategoryManagerProps = {
  categories: Category[];
  onEdit: (original: string, changes: { name: string; icon: string }) => void;
  onDelete: (name: string) => void;
  onCreate: (input: { name: string; icon: string; kind: Category["kind"] }) => void;
};

function DemoCategoryForm({
  category,
  categories,
  onSave,
  onClose,
}: {
  category?: Category;
  categories: Category[];
  onSave: (input: { name: string; icon: string; kind: Category["kind"] }) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: category?.name ?? "",
    kind: category?.kind ?? ("expense" as Category["kind"]),
    icon: category?.icon ?? (null as string | null),
  });
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length === 0 || name.length > 100) {
      setError("Use a name of 1 to 100 characters.");
      return;
    }
    if (
      categories.some(
        (item) => item.id !== category?.id && item.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("A category with this name already exists.");
      return;
    }
    onSave({ name, kind: draft.kind, icon: categoryIconChoice(name, draft.icon) });
    onClose();
  };
  return (
    <ModalDialog labelledBy="demo-category-title" onClose={onClose}>
      <form className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.header}>
          <h2 className="text-xl font-bold" id="demo-category-title">
            {category ? "Edit category" : "New category"}
          </h2>
          <Button aria-label="Close category form" isIconOnly onPress={onClose} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        <TextField
          isInvalid={Boolean(error)}
          name="name"
          onChange={(name) => setDraft((previous) => ({ ...previous, name }))}
          value={draft.name}
        >
          <Label>Category name</Label>
          <Input
            autoFocus
            className="min-h-11 text-base"
            maxLength={100}
            placeholder="e.g. Pet care"
          />
          <FieldError>{error}</FieldError>
        </TextField>
        <CategoryKindField
          value={draft.kind}
          disabled={Boolean(category)}
          onChange={(kind) => setDraft((previous) => ({ ...previous, kind }))}
        />
        <p className={styles.meta}>The category type stays fixed after creation.</p>
        <CategoryIconPicker
          name={draft.name}
          onChange={(icon) => setDraft((previous) => ({ ...previous, icon }))}
          value={draft.icon}
        />
        <p className={styles.meta}>Changes last for this demo visit.</p>
        <div className={styles.footer}>
          <Button className="min-h-11" onPress={onClose} variant="secondary">
            Cancel
          </Button>
          <Button className="min-h-11" type="submit">
            Save category
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

function DemoCategoryDelete({
  category,
  onDelete,
  onClose,
}: {
  category: Category;
  onDelete: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <ModalDialog labelledBy="demo-delete-category-title" onClose={onClose}>
      <div className={styles.form}>
        <h2 className="text-xl font-bold" id="demo-delete-category-title">
          Delete {category.name}?
        </h2>
        <p className="text-sm leading-6 text-muted">
          This removes it from new category choices. Existing transactions and budgets keep their
          category.
        </p>
        <div className={styles.footer}>
          <Button className="min-h-11" onPress={onClose} variant="secondary">
            Keep category
          </Button>
          <Button
            className="min-h-11"
            onPress={() => {
              onDelete(category.name);
              onClose();
            }}
            variant="danger"
          >
            Delete category
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function DemoCategoryManager(props: DemoCategoryManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"create" | "edit" | "delete" | null>(null);
  const categories = props.categories.filter((category) => !category.isArchived);
  const selected = categories.find((category) => category.id === selectedId);
  const close = () => setPanel(null);
  return (
    <section aria-label="Categories" className={`${styles.item} mt-4`}>
      <CategoryManagementSelect
        categories={categories}
        selected={selected}
        onSelect={setSelectedId}
        onCreate={() => setPanel("create")}
        name="manageDemoCategory"
      />
      <CategoryActions
        selected={selected}
        onEdit={() => setPanel("edit")}
        onDelete={() => setPanel("delete")}
      />
      {panel === "create" && (
        <DemoCategoryForm categories={props.categories} onSave={props.onCreate} onClose={close} />
      )}
      {selected && panel === "edit" && (
        <DemoCategoryForm
          category={selected}
          categories={props.categories}
          key={selected.id}
          onSave={(changes) => props.onEdit(selected.name, changes)}
          onClose={close}
        />
      )}
      {selected && panel === "delete" && (
        <DemoCategoryDelete
          category={selected}
          onDelete={props.onDelete}
          onClose={() => {
            close();
            setSelectedId(null);
          }}
        />
      )}
    </section>
  );
}

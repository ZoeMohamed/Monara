"use client";

import { type Category, calendarDateSchema } from "@monara/contracts";
import { Button, FieldError, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";
import styles from "@/components/budget-manager.module.css";
import { CategoryIconPicker } from "@/components/category-icon-picker";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { categoryIconChoice } from "@/data/category-icons";
import type { Budget, Transaction } from "@/data/demo-ledger";
import { parseDraftAmount } from "@/lib/finance/presentation";

export type CreateDemoBudgetInput = {
  category: string;
  icon: string | null;
  limit: number;
  startsOn: string;
  warningPercent: number;
  cadence: "monthly" | "weekly";
};

function useDemoBudgetDraft(
  today: string,
  onSave: (input: CreateDemoBudgetInput) => void,
  onClose: () => void,
  initialCadence: "monthly" | "weekly",
) {
  const [draft, setDraft] = useState({
    category: "",
    icon: null as string | null,
    amount: "",
    startsOn: today,
    warningPercent: "80",
    cadence: initialCadence,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({});
  const [initial] = useState(draft);
  const [discard, setDiscard] = useState(false);
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof typeof draft] !== initial[key as keyof typeof draft],
  );
  const close = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  const change = (patch: Partial<typeof draft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as (keyof typeof draft)[]) delete next[key];
      return next;
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    let limit: number | null = null;
    try {
      limit = parseDraftAmount(draft.amount);
    } catch {
      next.amount = "Enter a positive whole amount of rupiah.";
    }
    if (limit === null || limit <= 0) next.amount = "Enter a positive whole amount of rupiah.";
    if (draft.category.trim().length === 0 || draft.category.trim().length > 100)
      next.category = "Enter a category name, up to 100 characters.";
    if (!calendarDateSchema.safeParse(draft.startsOn).success)
      next.startsOn = "Choose a valid start date.";
    const warningPercent = Number(draft.warningPercent);
    if (!/^\d+$/.test(draft.warningPercent) || warningPercent < 1 || warningPercent > 100)
      next.warningPercent = "Enter a percentage from 1 to 100.";
    if (Object.keys(next).length > 0 || limit === null) {
      setErrors(next);
      const form = event.currentTarget;
      requestAnimationFrame(() =>
        form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    try {
      onSave({
        category: draft.category.trim(),
        icon: categoryIconChoice(draft.category, draft.icon),
        limit,
        startsOn: draft.startsOn,
        warningPercent,
        cadence: draft.cadence,
      });
    } catch (error) {
      setErrors({
        category:
          error instanceof Error
            ? error.message
            : "This budget could not be added. Check the category and try again.",
      });
      return;
    }
    onClose();
  };
  return { draft, errors, change, submit, close, discard, keepEditing: () => setDiscard(false) };
}

export function DemoBudgetCreator({
  budgets,
  transactions,
  today,
  onSave,
  onClose,
  demoCategories,
  initialCadence = "monthly",
}: {
  budgets: Budget[];
  transactions: Transaction[];
  today: string;
  onSave: (input: CreateDemoBudgetInput) => void;
  onClose: () => void;
  demoCategories?: Category[];
  initialCadence?: "monthly" | "weekly";
}) {
  const editor = useDemoBudgetDraft(today, onSave, onClose, initialCadence);
  const [newCategory, setNewCategory] = useState(false);
  const budgeted = new Set(
    budgets
      .filter((budget) => budget.cadence === editor.draft.cadence)
      .map((budget) => budget.category.trim().toLowerCase()),
  );
  const categories = (
    demoCategories
      ? demoCategories
          .filter((category) => !category.isArchived && category.kind === "expense")
          .map((category) => category.name)
          .sort((a, b) => a.localeCompare(b))
      : [
          ...new Set([
            ...budgets.map((budget) => budget.category),
            ...transactions.flatMap((transaction) =>
              transaction.kind === "expense" && transaction.category ? [transaction.category] : [],
            ),
          ]),
        ].sort((a, b) => a.localeCompare(b))
  ).filter((category) => !budgeted.has(category.trim().toLowerCase()));
  const { draft, errors, change } = editor;
  if (editor.discard)
    return (
      <ModalDialog labelledBy="demo-new-budget-discard-title" onClose={editor.keepEditing}>
        <div className={styles.form}>
          <h2 className="text-xl font-bold" id="demo-new-budget-discard-title">
            Discard this budget?
          </h2>
          <p className="text-sm leading-6 text-muted">
            This budget hasn’t been added. Keep editing to hold on to your entries.
          </p>
          <div className={styles.footer}>
            <Button className="min-h-11" onPress={onClose} variant="secondary">
              Discard budget
            </Button>
            <Button autoFocus className="min-h-11" onPress={editor.keepEditing}>
              Keep editing
            </Button>
          </div>
        </div>
      </ModalDialog>
    );
  return (
    <ModalDialog labelledBy="demo-new-budget-title" onClose={editor.close}>
      <form className={styles.form} noValidate onSubmit={editor.submit}>
        <div className={styles.header}>
          <h2 className="text-xl font-bold" id="demo-new-budget-title">
            Add budget
          </h2>
          <Button aria-label="Close new budget" isIconOnly onPress={editor.close} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        {newCategory || categories.length === 0 ? (
          <TextField
            isInvalid={Boolean(errors.category)}
            name="category"
            onChange={(category) => change({ category })}
            value={draft.category}
          >
            <Label>New category name</Label>
            <Input
              autoFocus
              className="min-h-11 text-base"
              maxLength={100}
              placeholder="e.g. Pet care"
            />
            <FieldError>{errors.category}</FieldError>
          </TextField>
        ) : (
          <Select
            className="w-full"
            isInvalid={Boolean(errors.category)}
            name="category"
            onChange={(value) => {
              if (value === "__create_category__") {
                setNewCategory(true);
                change({ category: "", icon: null });
              } else
                change({
                  category: value === null ? "" : String(value),
                  icon:
                    demoCategories?.find((category) => category.name === value)?.icon ??
                    budgets.find((budget) => budget.category === value)?.icon ??
                    null,
                });
            }}
            placeholder="Choose a category"
            value={draft.category || null}
          >
            <Label>Category</Label>
            <Select.Trigger className="min-h-11">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {categories.map((category) => (
                  <ListBox.Item id={category} key={category} textValue={category}>
                    {category}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
                <ListBox.Item id="__create_category__" textValue="Create new category">
                  <Icon className="h-4 w-4" name="plus" />
                  Create new category…
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
            <FieldError>{errors.category}</FieldError>
          </Select>
        )}
        {newCategory && (
          <Button
            className="min-h-11 justify-start rounded-xl text-sm"
            onPress={() => {
              setNewCategory((previous) => !previous);
              change({ category: "", icon: null });
            }}
            variant="ghost"
          >
            <Icon className="h-4 w-4" name="plus" />
            Choose an existing category
          </Button>
        )}
        <CategoryIconPicker
          name={draft.category}
          onChange={(icon) => change({ icon })}
          value={draft.icon}
        />
        <DemoBudgetValues editor={editor} />
        <p className={styles.meta}>Changes last for this demo visit.</p>
        <div className={styles.footer}>
          <Button className="min-h-11" onPress={editor.close} variant="secondary">
            Cancel
          </Button>
          <Button className="min-h-11" type="submit">
            Add budget
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

function DemoBudgetValues({ editor }: { editor: ReturnType<typeof useDemoBudgetDraft> }) {
  const { draft, errors, change } = editor;
  return (
    <>
      <fieldset className={styles.field}>
        <legend className={styles.label}>Period</legend>
        <div className="mt-1 flex gap-2">
          {(["monthly", "weekly"] as const).map((cadence) => (
            <Button
              aria-pressed={draft.cadence === cadence}
              className="min-h-11 flex-1 rounded-full"
              key={cadence}
              onPress={() => change({ cadence, category: "" })}
              variant={draft.cadence === cadence ? "primary" : "secondary"}
            >
              {cadence === "monthly" ? "Monthly" : "Weekly"}
            </Button>
          ))}
        </div>
      </fieldset>
      <TextField
        isInvalid={Boolean(errors.amount)}
        name="amount"
        onChange={(amount) => change({ amount })}
        value={draft.amount}
      >
        <Label>{draft.cadence === "weekly" ? "Weekly" : "Monthly"} limit in rupiah</Label>
        <Input className="min-h-11 text-base" inputMode="numeric" maxLength={16} />
        <FieldError>{errors.amount}</FieldError>
      </TextField>
      <p className={styles.meta}>
        {draft.cadence === "weekly"
          ? "Resets every seven days from your chosen start date. Only confirmed expenses in that week count."
          : "Resets each month on your chosen start day. Only confirmed expenses in that period count."}
      </p>
      <TextField
        isInvalid={Boolean(errors.startsOn)}
        name="startsOn"
        onChange={(startsOn) => change({ startsOn })}
        type="date"
        value={draft.startsOn}
      >
        <Label>Period starts on</Label>
        <Input className="min-h-11 text-base" />
        <FieldError>{errors.startsOn}</FieldError>
      </TextField>
      <TextField
        isInvalid={Boolean(errors.warningPercent)}
        name="warningPercent"
        onChange={(warningPercent) => change({ warningPercent })}
        value={draft.warningPercent}
      >
        <Label>Notify me at (%)</Label>
        <Input className="min-h-11 text-base" inputMode="numeric" maxLength={3} />
        <FieldError>{errors.warningPercent}</FieldError>
      </TextField>
    </>
  );
}

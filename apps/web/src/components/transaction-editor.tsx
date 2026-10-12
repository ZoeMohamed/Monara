"use client";

import { Button, FieldError, Form, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import { type FormEvent, useState } from "react";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import {
  demoCategoryNames,
  demoMethods,
  demoToday,
  demoTransferMethods,
  type Transaction,
  type TransactionErrors,
  type TransactionValues,
  transactionErrors,
} from "@/data/demo-ledger";

function ChoiceField({
  name,
  label,
  options,
  value,
  error,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  value: string | null;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <Select
      name={name}
      placeholder="Not selected"
      value={value}
      onChange={(key) => onChange(key === null ? null : String(key))}
      isInvalid={!!error}
      className="w-full"
      data-field={name}
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11" aria-invalid={!!error}>
        <Select.Value />
        <Select.ClearButton />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option} id={option} textValue={option}>
              {option}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <FieldError>{error}</FieldError>
    </Select>
  );
}

const typeLabels = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;
const kinds = Object.values(typeLabels);
const kindKeys = Object.keys(typeLabels) as Array<keyof typeof typeLabels>;

function TransactionFields({
  transaction,
  errors,
}: {
  transaction?: Transaction;
  errors: TransactionErrors;
}) {
  return (
    <>
      <TextField
        name="merchant"
        defaultValue={transaction?.merchant ?? ""}
        isInvalid={!!errors.merchant}
      >
        <Label>Merchant or income source</Label>
        <Input autoFocus className="min-h-11 text-base" placeholder="e.g. Kopi Kenangan" />
        <FieldError>{errors.merchant}</FieldError>
      </TextField>
      <TextField
        name="amount"
        type="number"
        defaultValue={transaction?.amount?.toString() ?? ""}
        isInvalid={!!errors.amount}
      >
        <Label>Amount in rupiah</Label>
        <Input
          className="min-h-11 text-base"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="Enter the amount"
        />
        <FieldError>{errors.amount}</FieldError>
      </TextField>
      <TextField
        name="date"
        type="date"
        defaultValue={transaction ? (transaction.date ?? "") : demoToday}
        isInvalid={!!errors.date}
      >
        <Label>Transaction date</Label>
        <Input className="min-h-11 text-base" />
        <FieldError>{errors.date}</FieldError>
      </TextField>
    </>
  );
}

export function TransactionEditor({
  transaction,
  onClose,
  onSave,
}: {
  transaction?: Transaction;
  onClose: () => void;
  onSave: (values: TransactionValues, action: "edit" | "confirm") => void;
}) {
  const [kind, setKind] = useState<string | null>(
    transaction?.kind ? typeLabels[transaction.kind] : null,
  );
  const [currency, setCurrency] = useState<string | null>(
    transaction ? transaction.currency : "IDR",
  );
  const [category, setCategory] = useState<string | null>(transaction?.category ?? null);
  const [method, setMethod] = useState<string | null>(transaction?.method ?? null);
  const [errors, setErrors] = useState<TransactionErrors>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Older iOS Safari has no SubmitEvent. Without a known button, an import stays pending.
    const submitter = "submitter" in event.nativeEvent ? event.nativeEvent.submitter : null;
    const action =
      submitter instanceof HTMLButtonElement
        ? submitter.value === "edit"
          ? "edit"
          : "confirm"
        : transaction
          ? "edit"
          : "confirm";
    const data = new FormData(event.currentTarget);
    const amount = String(data.get("amount") ?? "").trim();
    const values: TransactionValues = {
      merchant: String(data.get("merchant") ?? "").trim() || null,
      amount: amount ? Number(amount) : null,
      date: String(data.get("date") ?? "").trim() || null,
      kind: kindKeys.find((key) => typeLabels[key] === kind) ?? null,
      currency: currency === "IDR" ? "IDR" : null,
      category,
      method,
      time: transaction?.time ?? null,
    };
    const validation = transactionErrors(values);
    if (action === "edit") {
      for (const field of ["kind", "amount", "currency", "date", "method"] as const) {
        if (values[field] === null) delete validation[field];
      }
    }
    if (!transaction) {
      if (!values.merchant) validation.merchant = "Enter a merchant or income source.";
      if (!values.method) validation.method = "Choose a Financial Account.";
    }
    setErrors(validation);
    const firstInvalid = Object.keys(validation)[0];
    if (firstInvalid) {
      const control = event.currentTarget.querySelector<HTMLElement>(
        `input[name="${firstInvalid}"], [data-field="${firstInvalid}"] button`,
      );
      control?.focus();
    } else onSave(values, action);
  };

  return (
    <ModalDialog labelledBy="transaction-editor-title" onClose={onClose}>
      <Form className="space-y-4 p-4 sm:p-6" onSubmit={submit} validationBehavior="aria">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-accent">
              {transaction ? "Review import" : "Add manually"}
            </p>
            <h2 id="transaction-editor-title" className="mt-2 text-xl font-bold">
              {transaction ? "Edit transaction" : "New transaction"}
            </h2>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close transaction form" onPress={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        <p className="text-sm leading-6 text-muted">
          {transaction
            ? "Keep uncertain fields empty. Type, amount, currency, and date are needed to confirm."
            : "This sample transaction is confirmed immediately and stays in this session only."}
        </p>
        <TransactionFields transaction={transaction} errors={errors} />
        <ChoiceField
          name="kind"
          label="Transaction type"
          options={kinds}
          value={kind}
          error={errors.kind}
          onChange={(nextKind) => {
            setKind(nextKind);
            const allowed = nextKind === "Transfer" ? demoTransferMethods : demoMethods;
            if (method && !allowed.includes(method)) setMethod(null);
          }}
        />
        <ChoiceField
          name="currency"
          label="Currency"
          options={["IDR"]}
          value={currency}
          error={errors.currency}
          onChange={setCurrency}
        />
        <ChoiceField
          name="method"
          label={kind === "Transfer" ? "Financial Accounts (from → to)" : "Financial Account"}
          options={kind === "Transfer" ? demoTransferMethods : demoMethods}
          value={method}
          error={errors.method}
          onChange={setMethod}
        />
        <ChoiceField
          name="category"
          label="Category"
          options={demoCategoryNames}
          value={category}
          onChange={setCategory}
        />
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Check the marked fields before continuing.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Button className="min-h-11" variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          {transaction && (
            <Button
              className="min-h-11"
              variant="secondary"
              type="submit"
              name="action"
              value="edit"
            >
              Save changes
            </Button>
          )}
          <Button className="min-h-11" type="submit" name="action" value="confirm">
            {transaction ? "Save and confirm" : "Save transaction"}
          </Button>
        </div>
      </Form>
    </ModalDialog>
  );
}

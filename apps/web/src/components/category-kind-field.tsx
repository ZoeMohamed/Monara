"use client";

import type { Category } from "@monara/contracts";
import { Label, ListBox, Select } from "@monara/ui";

const kinds = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "exclusion", label: "Exclusion" },
] as const;

export function CategoryKindField({
  value,
  onChange,
  disabled,
}: {
  value: Category["kind"];
  onChange: (kind: Category["kind"]) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      name="categoryKind"
      value={value}
      isDisabled={disabled}
      onChange={(value) => {
        const kind = kinds.find((kind) => kind.id === value);
        if (kind) onChange(kind.id);
      }}
    >
      <Label>Category type</Label>
      <Select.Trigger className="min-h-11">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {kinds.map((kind) => (
            <ListBox.Item id={kind.id} key={kind.id} textValue={kind.label}>
              {kind.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

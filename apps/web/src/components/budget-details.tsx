"use client";

import { Button, Chip } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { formatDay } from "@/data/demo-ledger";

export type BudgetDetailsRecord = {
  name: string;
  category: string;
  icon?: string;
  cadence: "weekly" | "monthly";
  limit: bigint;
  warningPercent: number;
  startsOn?: string;
  status: string;
  usage?: {
    used: bigint;
    remaining: bigint;
    periodStartsOn: string | null;
    periodEndsOn: string | null;
  };
};

function BudgetUsageDetails({ usage }: { usage: NonNullable<BudgetDetailsRecord["usage"]> }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface-secondary p-4">
      <div className="min-w-0">
        <p className="text-xs text-muted">Spent</p>
        <p className="mt-1 break-words text-base font-bold tabular-nums">
          {formatRupiah(usage.used)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{usage.remaining < 0n ? "Over budget" : "Remaining"}</p>
        <p
          className={`mt-1 break-words text-base font-bold tabular-nums ${usage.remaining < 0n ? "text-danger" : ""}`}
        >
          {formatRupiah(usage.remaining < 0n ? -usage.remaining : usage.remaining)}
        </p>
      </div>
    </div>
  );
}

export function BudgetDetails({
  record,
  onClose,
  onEdit,
  onDelete,
}: {
  record: BudgetDetailsRecord;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const period = record.usage;
  return (
    <ModalDialog labelledBy="budget-details-title" onClose={onClose}>
      <div className="grid min-w-0 gap-5 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold" id="budget-details-title">
            Budget details
          </h2>
          <Button
            aria-label="Close budget details"
            className="min-h-11 rounded-full"
            isIconOnly
            onPress={onClose}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <CategoryAvatar
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground"
            icon={record.icon}
            iconClassName="h-6 w-6"
            name={record.category}
            size={48}
          />
          <div className="min-w-0">
            <h3 className="break-words text-base font-bold">{record.name}</h3>
            <Chip className="mt-1" size="sm" variant="soft">
              {record.status}
            </Chip>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted">
            {record.cadence === "monthly" ? "Monthly" : "Weekly"} limit
          </p>
          <p className="mt-1 break-words text-3xl font-extrabold tracking-[-.03em] tabular-nums">
            {formatRupiah(record.limit)}
          </p>
        </div>
        {period ? (
          <BudgetUsageDetails usage={period} />
        ) : (
          <p className="text-sm text-muted">Usage is unavailable for this period.</p>
        )}
        <dl className="grid gap-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted">Category</dt>
            <dd className="min-w-0 break-words font-semibold">{record.category}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted">Period</dt>
            <dd className="font-semibold">
              {period?.periodStartsOn && period.periodEndsOn
                ? `${formatDay(period.periodStartsOn)} – ${formatDay(period.periodEndsOn)}`
                : record.startsOn
                  ? `Starts ${formatDay(record.startsOn)}`
                  : "Not started"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted">Warning at</dt>
            <dd className="font-semibold">{record.warningPercent}%</dd>
          </div>
        </dl>
        <div className="flex flex-wrap justify-end gap-2 border-t border-separator pt-4">
          {onDelete && (
            <Button
              className="min-h-11 rounded-full text-danger"
              onPress={onDelete}
              variant="ghost"
            >
              Delete budget
            </Button>
          )}
          <Button className="min-h-11 rounded-full" onPress={onEdit}>
            Edit budget
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

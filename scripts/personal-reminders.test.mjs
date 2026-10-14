import assert from "node:assert/strict";
import test from "node:test";
import {
  duePersonalReminders,
  personalReminderErrors,
} from "../apps/web/src/data/personal-reminders.ts";

const draft = { title: "Synthetic rent", kind: "payment", dueOn: "2026-10-14", amount: null };

test("reminders permit unknown payment amounts and validate entered money and calendar dates", () => {
  assert.deepEqual(personalReminderErrors(draft), {});
  assert.deepEqual(personalReminderErrors({ ...draft, kind: "birthday" }), {});
  for (const amount of [0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(personalReminderErrors({ ...draft, amount }).amount);
  }
  assert.ok(personalReminderErrors({ ...draft, kind: "birthday", amount: 100 }).amount);
  assert.ok(personalReminderErrors({ ...draft, dueOn: "2026-02-29" }).dueOn);
  assert.deepEqual(personalReminderErrors({ ...draft, dueOn: "2024-02-29" }), {});
  assert.ok(personalReminderErrors({ ...draft, title: " " }).title);
});

test("notification badge counts only due personal reminders without treating acknowledgement as payment", () => {
  const records = [
    { ...draft, id: "today", completedAt: null },
    { ...draft, id: "past", dueOn: "2026-10-13", completedAt: null },
    { ...draft, id: "future", dueOn: "2026-10-15", completedAt: null },
    { ...draft, id: "done", completedAt: "2026-10-14T08:00:00Z" },
  ];
  assert.equal(duePersonalReminders(records, "2026-10-14"), 2);
  assert.equal(records[0].amount, null);
  assert.equal(records[0].completedAt, null);
});

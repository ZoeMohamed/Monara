import assert from "node:assert/strict";
import { it } from "node:test";

import {
  currentStep,
  importPercent,
  importSteps,
  stepFromCounts,
  withReachedStep,
} from "./import-steps.ts";

const waiting = {
  state: "waiting",
  emailsRead: null,
  totalEmails: null,
  transactions: null,
  feed: [],
};
const running = (counts) => ({
  state: "running",
  emailsRead: 0,
  totalEmails: 0,
  transactions: 0,
  categorizing: 0,
  feed: [],
  ...counts,
});

function summary(progress) {
  return importSteps(progress).map(({ state, detail }) => `${state}:${detail ?? "-"}`);
}

it("starts on finding emails and counts what it finds", () => {
  assert.equal(stepFromCounts(waiting), 0);
  assert.deepEqual(summary(withReachedStep(waiting, waiting)), [
    "active:-",
    "upcoming:-",
    "upcoming:-",
  ]);
  const finding = withReachedStep(running({ totalEmails: 24 }), waiting);
  assert.deepEqual(summary(finding), ["active:24 found", "upcoming:-", "upcoming:-"]);
  assert.equal(importPercent(finding), null);
  const more = withReachedStep(running({ totalEmails: 66 }), finding);
  assert.equal(importSteps(more)[0].detail, "66 found");
});

it("reads emails against the number found, which the first step keeps showing", () => {
  const progress = withReachedStep(running({ emailsRead: 12, totalEmails: 66 }), waiting);
  assert.equal(currentStep(progress), 1);
  assert.deepEqual(summary(progress), ["done:66 found", "active:12 / 66", "upcoming:-"]);
  assert.equal(importPercent(progress), 9);
});

it("categorizes once every email found is read, counting only transactions", () => {
  const progress = withReachedStep(
    running({ emailsRead: 66, totalEmails: 66, transactions: 16, categorizing: 11 }),
    waiting,
  );
  assert.equal(currentStep(progress), 2);
  assert.deepEqual(summary(progress), ["done:66 found", "done:66 / 66", "active:5 / 16"]);
  assert.equal(importPercent(progress), 66);
});

it("never steps back when more mail is listed after everything found was read", () => {
  const reading = withReachedStep(
    running({ emailsRead: 50, totalEmails: 50, transactions: 9, categorizing: 3 }),
    waiting,
  );
  const listed = withReachedStep(
    running({ emailsRead: 50, totalEmails: 100, transactions: 9, categorizing: 3 }),
    reading,
  );
  assert.equal(currentStep(listed), 2);
  assert.equal(importSteps(listed)[1].detail, "50 / 100");
});

it("finishes every step with the final counts", () => {
  const done = withReachedStep(
    { ...running({ emailsRead: 66, totalEmails: 66, transactions: 16 }), state: "completed" },
    waiting,
  );
  assert.deepEqual(summary(done), ["done:66 found", "done:66 / 66", "done:16 / 16"]);
  assert.equal(importPercent(done), 100);
});

it("shows no categorizing count when the emails held no transactions", () => {
  const progress = withReachedStep(running({ emailsRead: 8, totalEmails: 8 }), waiting);
  assert.equal(importSteps(progress)[2].detail, null);
  assert.equal(importPercent(progress), null);
});

it("keeps a running import below a full bar until the sync completes", () => {
  const progress = withReachedStep(
    running({ emailsRead: 66, totalEmails: 66, transactions: 16, categorizing: 0 }),
    waiting,
  );
  assert.equal(importPercent(progress), 99);
  assert.equal(importPercent({ ...progress, state: "completed" }), 100);
});

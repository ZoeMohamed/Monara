import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountInputFor,
  addChoice,
  choiceFromSuggestion,
  choicesToCreate,
  choiceTitle,
  institutionsToAdd,
  removeChoice,
} from "./banks.ts";
import {
  migrateLegacyOnboardingPhase,
  parseOnboardingPhase,
  resolvePhase,
  returnsToOnboarding,
  setupPhase,
  showsSheet,
  stepIndex,
} from "./flow.ts";

const bca = {
  institutionKey: "BCA_MyBCA",
  name: "MyBCA",
  provider: "BCA",
  platform: "BANKING_APP",
  emailCount: 12,
  lastFours: ["1234"],
  linkedAccounts: [],
};

describe("onboarding phase", () => {
  it("moves only the legacy detect checkpoint back to the new name step", () => {
    assert.equal(migrateLegacyOnboardingPhase("detect"), "name");
    assert.equal(migrateLegacyOnboardingPhase("name"), "name");
    assert.equal(migrateLegacyOnboardingPhase("done"), "done");
    assert.equal(migrateLegacyOnboardingPhase(null), null);
  });
  it("starts a new User at connect and treats an existing mailbox as already set up", () => {
    assert.equal(resolvePhase(null, false), "connect");
    assert.equal(resolvePhase(null, true), "done");
  });

  it("continues at the stored phase only while a mailbox is connected", () => {
    assert.equal(resolvePhase("detect", true), "detect");
    assert.equal(resolvePhase("name", true), "name");
    assert.equal(resolvePhase("import", true), "import");
    assert.equal(resolvePhase("background", true), "background");
    assert.equal(resolvePhase("detect", false), "connect");
    assert.equal(resolvePhase("name", false), "connect");
    assert.equal(resolvePhase("background", false), "connect");
  });

  it("moves a returning connect on to the name step and never reopens a finished setup", () => {
    assert.equal(resolvePhase("connect", true), "name");
    assert.equal(resolvePhase("done", false), "done");
    assert.equal(resolvePhase("done", true), "done");
  });

  it("waits for the live mailbox check, but never for a finished setup or the demo", () => {
    assert.equal(setupPhase({ live: true, stored: null, mailboxId: undefined }), null);
    assert.equal(setupPhase({ live: true, stored: "detect", mailboxId: undefined }), null);
    assert.equal(setupPhase({ live: true, stored: "done", mailboxId: undefined }), "done");
    assert.equal(setupPhase({ live: true, stored: null, mailboxId: null }), "connect");
    assert.equal(setupPhase({ live: true, stored: null, mailboxId: "m1" }), "done");
    assert.equal(setupPhase({ live: true, stored: "name", mailboxId: "m1" }), "name");
    assert.equal(setupPhase({ live: false, stored: null, mailboxId: undefined }), "connect");
    assert.equal(setupPhase({ live: false, stored: "detect", mailboxId: undefined }), "detect");
  });

  it("opens the sheet for the four steps only", () => {
    const open = ["connect", "detect", "name", "import"].map(showsSheet);
    assert.deepEqual(open, [true, true, true, true]);
    assert.deepEqual([null, "background", "done"].map(showsSheet), [false, false, false]);
  });

  it("ignores stored values it does not know", () => {
    assert.equal(parseOnboardingPhase("import"), "import");
    assert.equal(parseOnboardingPhase("name"), "name");
    assert.equal(parseOnboardingPhase("skipped"), null);
    assert.equal(parseOnboardingPhase(undefined), null);
  });

  it("recognises the setup return marker only as an exact cookie", () => {
    assert.equal(returnsToOnboarding("monara-onboarding=1"), true);
    assert.equal(returnsToOnboarding("a=b; monara-onboarding=1; c=d"), true);
    assert.equal(returnsToOnboarding("monara-onboarding=0"), false);
    assert.equal(returnsToOnboarding("x-monara-onboarding=1"), false);
    assert.equal(returnsToOnboarding(null), false);
  });

  it("asks for the name before the banks, and keeps background import on the fourth step", () => {
    assert.deepEqual(
      ["connect", "name", "detect", "import", "background"].map(stepIndex),
      [0, 1, 2, 3, 3],
    );
  });
});

describe("onboarding bank choices", () => {
  it("lists a detected bank and marks an existing account as linked", () => {
    const detected = choiceFromSuggestion(bca);
    assert.equal(detected.linked, false);
    assert.equal(detected.manual, false);
    assert.equal(choiceTitle(detected), "BCA · MyBCA");
    const linked = choiceFromSuggestion({ ...bca, linkedAccounts: [{ id: "x", name: "Main" }] });
    assert.equal(linked.linked, true);
    assert.deepEqual(choicesToCreate([detected, linked]), [detected]);
  });

  it("adds a bank by hand once and removes a bank by key", () => {
    const detected = [choiceFromSuggestion(bca)];
    const [livin] = institutionsToAdd(detected, "livin");
    assert.equal(livin?.key, "Mandiri_Livin");
    const added = addChoice(detected, livin);
    assert.equal(added.length, 2);
    assert.equal(added[1]?.manual, true);
    assert.equal(addChoice(added, livin), added);
    assert.deepEqual(
      removeChoice(added, "BCA_MyBCA").map((choice) => choice.institutionKey),
      ["Mandiri_Livin"],
    );
  });

  it("links the account to the mailbox it was found in", () => {
    const choice = choiceFromSuggestion(bca);
    const mailbox = "00000000-0000-4000-8000-000000000010";
    assert.equal(accountInputFor(choice, "r", mailbox).gmailConnectionId, mailbox);
    assert.equal(accountInputFor(choice, "r").gmailConnectionId, null);
  });

  it("keeps the request id it is given so a retry cannot create the account twice", () => {
    const choice = choiceFromSuggestion(bca);
    assert.equal(accountInputFor(choice, "retry-1").clientRequestId, "retry-1");
    assert.equal(accountInputFor(choice, "retry-1").clientRequestId, "retry-1");
    assert.notEqual(
      accountInputFor(choice).clientRequestId,
      accountInputFor(choice).clientRequestId,
    );
  });

  it("does not offer a bank that is already listed and matches every search word", () => {
    const detected = [choiceFromSuggestion(bca)];
    assert.ok(!institutionsToAdd(detected, "").some((entry) => entry.key === "BCA_MyBCA"));
    assert.ok(institutionsToAdd(detected, "bca card").every((entry) => entry.key === "BCA_CC"));
    assert.deepEqual(institutionsToAdd(detected, "no such bank"), []);
  });

  it("builds the account Gmail imports to, using a last four only when it is certain", () => {
    const one = accountInputFor(choiceFromSuggestion(bca));
    assert.equal(one.lastFour, "1234");
    assert.equal(one.institutionKey, "BCA_MyBCA");
    assert.equal(one.accountType, "bank");
    const many = accountInputFor(choiceFromSuggestion({ ...bca, lastFours: ["1234", "5678"] }));
    assert.equal(many.lastFour, null);
    const wallet = accountInputFor(
      choiceFromSuggestion({ ...bca, institutionKey: "OVO", platform: "E_WALLET" }),
    );
    assert.equal(wallet.accountType, "wallet");
  });
});

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./demo-ledger" &&
      /\/data\/(app-navigation|finance-analytics)\.ts$/.test(context.parentURL ?? "")
    ) {
      return nextResolve("./demo-ledger.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { buildAppHref, clearedView, parseAppView, screenPaths } = await import(
  "../apps/web/src/data/app-navigation.ts"
);
const { cashFlowMonths, monthComparison } = await import(
  "../apps/web/src/data/finance-analytics.ts"
);
const { shiftMonth } = await import("../apps/web/src/data/demo-ledger.ts");
hooks.deregister();

const demoMonth = "2026-10";
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

function view(overrides = {}) {
  return {
    basePath: "",
    screen: "home",
    month: demoMonth,
    reportPeriod: "monthly",
    reportYear: (overrides.month ?? demoMonth).slice(0, 4),
    reviewOpen: false,
    kindFilter: "all",
    transactionId: null,
    editId: null,
    adding: false,
    remindersOpen: false,
    rejectId: null,
    ...overrides,
  };
}

function parse(href) {
  const url = new URL(href, "https://monara.example");
  return parseAppView(url.pathname, url.searchParams);
}

test("each screen has a canonical route with an explicit month and no default filters", () => {
  for (const [screen, pathname] of Object.entries(screenPaths)) {
    const state = view({ screen });
    assert.equal(buildAppHref(state), `${pathname}?month=${demoMonth}`);
    assert.deepEqual(parse(pathname), state);
    assert.deepEqual(parse(buildAppHref(state)), state);
  }
});

test("yearly Reports use allowlisted period and year fields and retain them in transaction detail links", () => {
  const state = view({
    screen: "reports",
    reportPeriod: "yearly",
    reportYear: "2024",
    transactionId: firstId,
  });
  const href = buildAppHref(state);
  assert.equal(href, `/reports?month=${demoMonth}&period=yearly&year=2024&transaction=${firstId}`);
  assert.deepEqual(parse(href), state);
  assert.deepEqual(
    parse(buildAppHref(clearedView(state))),
    view({ screen: "reports", reportPeriod: "yearly", reportYear: "2024" }),
  );
  assert.deepEqual(clearedView(state, "transactions"), view({ screen: "transactions" }));
  for (const year of ["0000", "0099", "2024", "9999"]) {
    assert.equal(parse(`/reports?period=yearly&year=${year}`).reportYear, year);
  }
});

test("invalid report periods and years are discarded and annual fields do not leak into other screens", () => {
  for (const year of ["", "24", "10000", "-2024", "2024-01", "2024&merchant=private", "2024 "]) {
    assert.equal(
      parse(`/reports?period=yearly&year=${encodeURIComponent(year)}`).reportYear,
      "2026",
    );
  }
  assert.deepEqual(parse("/reports?period=week&year=2024"), view({ screen: "reports" }));
  assert.deepEqual(
    parse("/transactions?period=yearly&year=2024"),
    view({ screen: "transactions" }),
  );
  assert.equal(
    buildAppHref(view({ screen: "reports", reportPeriod: "yearly", reportYear: "private" })),
    `/reports?month=${demoMonth}&period=yearly&year=2026`,
  );
  assert.equal(
    buildAppHref(view({ screen: "transactions", reportPeriod: "yearly", reportYear: "2024" })),
    `/transactions?month=${demoMonth}`,
  );
});

test("ledger filters and popup states survive a serialized history roundtrip", () => {
  for (const kindFilter of ["all", "expense", "income", "exclusion"]) {
    for (const reviewOpen of [false, true]) {
      for (const popup of [
        {},
        { transactionId: firstId },
        { editId: secondId },
        { adding: true },
        { remindersOpen: true },
        { rejectId: firstId },
      ]) {
        const state = view({
          screen: "transactions",
          month: "2024-02",
          kindFilter,
          reviewOpen,
          ...popup,
        });
        const serialized = JSON.parse(JSON.stringify(state));
        const href = buildAppHref(serialized);
        assert.deepEqual(parse(href), state, href);
        assert.equal(buildAppHref(parse(href)), href);
      }
    }
  }
});

test("review and type query values only apply to transactions", () => {
  assert.deepEqual(
    parse("/transactions?month=2026-09&view=review&type=income"),
    view({ screen: "transactions", month: "2026-09", reviewOpen: true, kindFilter: "income" }),
  );
  for (const [screen, pathname] of Object.entries(screenPaths)) {
    if (screen === "transactions") continue;
    const parsed = parse(`${pathname}?view=review&type=expense`);
    assert.equal(parsed.reviewOpen, false);
    assert.equal(parsed.kindFilter, "all");
    assert.equal(
      buildAppHref(view({ screen, reviewOpen: true, kindFilter: "expense" })),
      `${pathname}?month=${demoMonth}`,
    );
  }
});

test("invalid months and complete dates fall back instead of normalizing into another month", () => {
  for (const month of [
    "",
    "2026-00",
    "2026-13",
    "2026-1",
    "2026-01-01",
    "2024-02-29",
    "2026-02-30",
    "2026-10T00:00:00Z",
    " 2026-10",
    "2026-10 ",
    "2026-10&add=1",
    "Today",
  ]) {
    const params = new URLSearchParams({ month });
    assert.equal(parseAppView("/reports", params).month, demoMonth, month);
    assert.equal(buildAppHref(view({ screen: "reports", month })), `/reports?month=${demoMonth}`);
  }
  for (const month of ["1900-02", "2000-02", "2024-02", "2026-12"]) {
    assert.equal(parse(`/reports?month=${month}`).month, month);
  }
});

test("selected months leave enough calendar history for every report", () => {
  for (const month of ["0000-01", "0000-02", "0000-03", "0000-04", "0000-05"]) {
    assert.equal(parse(`/reports?month=${month}`).month, demoMonth);
    assert.equal(buildAppHref(view({ screen: "reports", month })), `/reports?month=${demoMonth}`);
  }
  for (const month of ["0000-06", "9999-12"]) {
    const selected = parse(`/reports?month=${month}`);
    assert.equal(selected.month, month);
    assert.equal(buildAppHref(selected), `/reports?month=${month}`);
    assert.equal(cashFlowMonths([], selected.month).length, 6);
    assert.doesNotThrow(() => monthComparison([], selected.month));
  }
  for (const month of [shiftMonth("0000-06", 1), shiftMonth("9999-12", -1)]) {
    assert.equal(parse(`/reports?month=${month}`).month, month);
  }
});

test("unknown types, views, and add flags keep safe defaults", () => {
  for (const value of ["", "all", "transfer", "EXPENSE", "debit", "../income", "income&add=1"]) {
    const parsed = parseAppView("/transactions", new URLSearchParams({ type: value }));
    assert.equal(parsed.kindFilter, "all", value);
  }
  for (const value of ["", "confirmed", "Review", "true", "1"]) {
    assert.equal(parse(`/transactions?view=${value}`).reviewOpen, false, value);
  }
  for (const value of ["", "true", "01", "0", "yes"]) {
    assert.equal(parse(`/transactions?add=${value}`).adding, false, value);
    assert.equal(parse(`/transactions?reminders=${value}`).remindersOpen, false, value);
  }
});

test("malformed identifiers never become transaction or edit parameters", () => {
  for (const id of [
    "",
    "pending-1",
    "00000000-0000-0000-0000-000000000000",
    "00000000-0000-4000-7000-000000000001",
    "00000000-0000-9000-8000-000000000001",
    `${firstId}extra`,
    ` ${firstId}`,
    `${firstId}&add=1`,
    "javascript:alert(1)",
    "https://elsewhere.example",
  ]) {
    const parsed = parseAppView(
      "/transactions",
      new URLSearchParams({ transaction: id, edit: id, reject: id }),
    );
    assert.equal(parsed.transactionId, null, id);
    assert.equal(parsed.editId, null, id);
    assert.equal(parsed.rejectId, null, id);
    assert.equal(
      buildAppHref(view({ screen: "transactions", transactionId: id, editId: id, rejectId: id })),
      `/transactions?month=${demoMonth}`,
    );
  }
  const uppercase = "DEADBEEF-CAFE-4ABC-8DEF-0123456789AB";
  assert.equal(parse(`/reports?transaction=${uppercase}`).transactionId, uppercase.toLowerCase());
});

test("popup precedence is add, then a valid edit, then a valid transaction", () => {
  const base = `month=2026-10&transaction=${firstId}&edit=${secondId}`;
  assert.deepEqual(parse(`/reports?${base}&add=1`), view({ screen: "reports", adding: true }));
  assert.deepEqual(parse(`/reports?${base}`), view({ screen: "reports", editId: secondId }));
  assert.deepEqual(
    parse(`/reports?transaction=${firstId}&edit=invalid&add=true`),
    view({ screen: "reports", transactionId: firstId }),
  );
  assert.equal(
    buildAppHref(
      view({ screen: "reports", transactionId: firstId, editId: secondId, adding: true }),
    ),
    `/reports?month=${demoMonth}&add=1`,
  );
  assert.equal(
    buildAppHref(view({ screen: "reports", transactionId: firstId, editId: secondId })),
    `/reports?month=${demoMonth}&edit=${secondId}`,
  );
});

test("reminders and rejection take precedence over transaction popups and each other", () => {
  const base = `month=2026-10&transaction=${firstId}&edit=${secondId}&add=1&reject=${firstId}`;
  assert.deepEqual(
    parse(`/transactions?${base}&reminders=1`),
    view({ screen: "transactions", remindersOpen: true }),
  );
  assert.deepEqual(
    parse(`/transactions?${base}&reminders=true`),
    view({ screen: "transactions", rejectId: firstId }),
  );
  assert.deepEqual(
    parse(`/transactions?add=1&reject=invalid&reminders=true`),
    view({ screen: "transactions", adding: true }),
  );
  const overlapping = view({
    screen: "transactions",
    remindersOpen: true,
    rejectId: firstId,
    adding: true,
    editId: secondId,
    transactionId: firstId,
  });
  assert.equal(buildAppHref(overlapping), `/transactions?month=${demoMonth}&reminders=1`);
  assert.equal(
    buildAppHref({ ...overlapping, remindersOpen: false }),
    `/transactions?month=${demoMonth}&reject=${firstId}`,
  );
});

test("clearing popup state preserves the month and same-screen filters without mutation", () => {
  const original = Object.freeze(
    view({
      screen: "transactions",
      month: "2026-08",
      reviewOpen: true,
      kindFilter: "expense",
      transactionId: firstId,
      editId: secondId,
      adding: true,
      remindersOpen: true,
      rejectId: firstId,
    }),
  );
  const cleared = clearedView(original);
  assert.deepEqual(
    cleared,
    view({ screen: "transactions", month: "2026-08", reviewOpen: true, kindFilter: "expense" }),
  );
  assert.equal(original.transactionId, firstId);
  assert.equal(original.editId, secondId);
  assert.equal(original.adding, true);
  assert.equal(original.remindersOpen, true);
  assert.equal(original.rejectId, firstId);
  assert.deepEqual(clearedView(original, "transactions"), cleared);
  assert.deepEqual(clearedView(original, "reports"), view({ screen: "reports", month: "2026-08" }));
});

test("URLs only contain approved navigation fields and cannot redirect or disclose search text", () => {
  for (const pathname of [
    "https://elsewhere.example/reports",
    "//elsewhere.example/transactions",
    "javascript:alert(1)",
    "/reports/../../profile",
    "/transactions/unknown",
  ]) {
    assert.equal(parseAppView(pathname, new URLSearchParams()).screen, "home", pathname);
  }
  const privateParams = new URLSearchParams({
    month: "2026-09",
    search: "Private merchant",
    q: "salary amount",
    amount: "9500000",
    returnTo: "https://elsewhere.example",
  });
  const href = buildAppHref(parseAppView("/reports", privateParams));
  assert.equal(href, "/reports?month=2026-09");
  const allowed = new Set([
    "month",
    "view",
    "type",
    "transaction",
    "edit",
    "add",
    "reminders",
    "reject",
  ]);
  assert.ok(
    [...new URL(href, "https://monara.example").searchParams.keys()].every((key) =>
      allowed.has(key),
    ),
  );
  for (const screen of ["//elsewhere.example", "javascript:alert(1)", "__proto__", "toString"]) {
    assert.equal(
      buildAppHref(view({ screen, search: "Private merchant", amount: "9500000" })),
      `/?month=${demoMonth}`,
    );
  }
});

test("the public demo keeps every screen and popup under /demo", () => {
  for (const [screen, pathname] of Object.entries(screenPaths)) {
    const demoPath = screen === "home" ? "/demo" : `/demo${pathname}`;
    const state = view({ basePath: "/demo", screen });
    assert.equal(buildAppHref(state), `${demoPath}?month=${demoMonth}`);
    assert.deepEqual(parse(demoPath), state);
    assert.deepEqual(clearedView(state, "reports").basePath, "/demo");
  }
  const popup = view({ basePath: "/demo", screen: "transactions", transactionId: firstId });
  assert.equal(buildAppHref(popup), `/demo/transactions?month=${demoMonth}&transaction=${firstId}`);
  assert.equal(parse("/demonstration").basePath, "");
  assert.equal(parse("/demonstration").screen, "home");
  assert.equal(buildAppHref(view({ basePath: "//elsewhere.example" })), `/?month=${demoMonth}`);
});

test("a missing or invalid month falls back to the supplied current month", () => {
  assert.equal(parseAppView("/", new URLSearchParams(), "2026-11").month, "2026-11");
  assert.equal(
    parseAppView("/", new URLSearchParams({ month: "2026-13" }), "2026-11").month,
    "2026-11",
  );
  assert.equal(parseAppView("/", new URLSearchParams(), "not-a-month").month, demoMonth);
});

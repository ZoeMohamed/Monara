import { demoMonth, earliestReportMonth, isCalendarDate } from "./demo-ledger";

export type AppScreen = "home" | "transactions" | "reports" | "budgets" | "chat" | "account";
export type LedgerKind = "all" | "expense" | "income" | "transfer";

export type AppView = {
  screen: AppScreen;
  month: string;
  reviewOpen: boolean;
  kindFilter: LedgerKind;
  transactionId: string | null;
  editId: string | null;
  adding: boolean;
  remindersOpen: boolean;
  rejectId: string | null;
};

export const screenPaths = {
  home: "/",
  transactions: "/transactions",
  reports: "/reports",
  budgets: "/budgets",
  chat: "/chat",
  account: "/profile",
} as const satisfies Record<AppScreen, string>;

function validMonth(value: string | null): string {
  return value &&
    /^\d{4}-\d{2}$/.test(value) &&
    isCalendarDate(`${value}-01`) &&
    value >= earliestReportMonth
    ? value
    : demoMonth;
}

function validKind(value: string | null): LedgerKind {
  return value === "expense" || value === "income" || value === "transfer" ? value : "all";
}

function validId(value: string | null): string | null {
  return value &&
    /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function screenForPath(pathname: string): AppScreen {
  for (const screen of Object.keys(screenPaths) as AppScreen[]) {
    if (screenPaths[screen] === pathname) return screen;
  }
  return "home";
}

export function parseAppView(
  pathname: string,
  params: { get(name: string): string | null },
): AppView {
  const screen = screenForPath(pathname);
  const remindersOpen = params.get("reminders") === "1";
  const rejectId = remindersOpen ? null : validId(params.get("reject"));
  const adding = !remindersOpen && !rejectId && params.get("add") === "1";
  const editId = remindersOpen || rejectId || adding ? null : validId(params.get("edit"));
  return {
    screen,
    month: validMonth(params.get("month")),
    reviewOpen: screen === "transactions" && params.get("view") === "review",
    kindFilter: screen === "transactions" ? validKind(params.get("type")) : "all",
    transactionId:
      remindersOpen || rejectId || adding || editId ? null : validId(params.get("transaction")),
    editId,
    adding,
    remindersOpen,
    rejectId,
  };
}

// Build from allowed fields instead of copying a query string that may contain financial text.
export function buildAppHref(view: AppView): string {
  const screen = Object.hasOwn(screenPaths, view.screen) ? view.screen : "home";
  const params = new URLSearchParams({ month: validMonth(view.month) });
  if (screen === "transactions") {
    if (view.reviewOpen === true) params.set("view", "review");
    const kind = validKind(view.kindFilter);
    if (kind !== "all") params.set("type", kind);
  }
  const editId = validId(view.editId);
  const transactionId = validId(view.transactionId);
  const rejectId = validId(view.rejectId);
  if (view.remindersOpen === true) params.set("reminders", "1");
  else if (rejectId) params.set("reject", rejectId);
  else if (view.adding === true) params.set("add", "1");
  else if (editId) params.set("edit", editId);
  else if (transactionId) params.set("transaction", transactionId);
  return `${screenPaths[screen]}?${params.toString()}`;
}

export function clearedView(view: AppView, screen: AppScreen = view.screen): AppView {
  const changingScreen = screen !== view.screen;
  return {
    screen,
    month: view.month,
    reviewOpen: changingScreen ? false : view.reviewOpen,
    kindFilter: changingScreen ? "all" : view.kindFilter,
    transactionId: null,
    editId: null,
    adding: false,
    remindersOpen: false,
    rejectId: null,
  };
}

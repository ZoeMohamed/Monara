import { demoMonth, earliestReportMonth, isCalendarDate } from "./demo-ledger";

export type AppScreen = "home" | "transactions" | "reports" | "budgets" | "chat" | "account";
/** "forecast" is not a transaction kind: it lists the payments expected over the next 30 days. */
export type LedgerKind = "all" | "expense" | "income" | "exclusion" | "forecast";
export type ReportPeriod = "monthly" | "yearly";

// The public demo mounts the same screens below /demo with sample data only.
type AppBasePath = "" | "/demo";

export type AppView = {
  basePath: AppBasePath;
  screen: AppScreen;
  month: string;
  reportPeriod: ReportPeriod;
  reportYear: string;
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

function validMonth(value: string | null, fallback = demoMonth): string {
  return value &&
    /^\d{4}-\d{2}$/.test(value) &&
    isCalendarDate(`${value}-01`) &&
    value >= earliestReportMonth
    ? value
    : fallback;
}

function validKind(value: string | null): LedgerKind {
  return value === "expense" || value === "income" || value === "exclusion" || value === "forecast"
    ? value
    : "all";
}

function validYear(value: string | null, fallback: string): string {
  return value && /^\d{4}$/.test(value) && isCalendarDate(`${value}-01-01`) ? value : fallback;
}

function validId(value: string | null): string | null {
  return value &&
    /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function basePathFor(pathname: string): AppBasePath {
  return pathname === "/demo" || pathname.startsWith("/demo/") ? "/demo" : "";
}

function screenForPath(pathname: string): AppScreen {
  const basePath = basePathFor(pathname);
  const local = pathname.slice(basePath.length) || "/";
  for (const screen of Object.keys(screenPaths) as AppScreen[]) {
    if (screenPaths[screen] === local) return screen;
  }
  return "home";
}

export function parseAppView(
  pathname: string,
  params: { get(name: string): string | null },
  defaultMonth = demoMonth,
): AppView {
  const screen = screenForPath(pathname);
  const month = validMonth(params.get("month"), validMonth(defaultMonth));
  const reportPeriod =
    screen === "reports" && params.get("period") === "yearly" ? "yearly" : "monthly";
  const remindersOpen = params.get("reminders") === "1";
  const rejectId = remindersOpen ? null : validId(params.get("reject"));
  const adding = !remindersOpen && !rejectId && params.get("add") === "1";
  const editId = remindersOpen || rejectId || adding ? null : validId(params.get("edit"));
  return {
    basePath: basePathFor(pathname),
    screen,
    month,
    reportPeriod,
    reportYear:
      reportPeriod === "yearly"
        ? validYear(params.get("year"), month.slice(0, 4))
        : month.slice(0, 4),
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
  if (screen === "reports" && view.reportPeriod === "yearly") {
    params.set("period", "yearly");
    params.set("year", validYear(view.reportYear, validMonth(view.month).slice(0, 4)));
  }
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
  const basePath = view.basePath === "/demo" ? "/demo" : "";
  const path = basePath && screen === "home" ? basePath : `${basePath}${screenPaths[screen]}`;
  return `${path}?${params.toString()}`;
}

export function clearedView(view: AppView, screen: AppScreen = view.screen): AppView {
  const changingScreen = screen !== view.screen;
  return {
    basePath: view.basePath,
    screen,
    month: view.month,
    reportPeriod: changingScreen ? "monthly" : view.reportPeriod,
    reportYear: changingScreen ? view.month.slice(0, 4) : view.reportYear,
    reviewOpen: changingScreen ? false : view.reviewOpen,
    kindFilter: changingScreen ? "all" : view.kindFilter,
    transactionId: null,
    editId: null,
    adding: false,
    remindersOpen: false,
    rejectId: null,
  };
}

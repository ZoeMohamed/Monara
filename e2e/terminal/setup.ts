// Creates the synthetic Users and records that the terminal evidence uses, then writes
// e2e/.results/terminal.env (owner-only, ignored by git). Values are never printed.
// Usage: node e2e/terminal/setup.ts   (after the local stack is running)
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestUser,
  localStack,
  repoRoot,
  requestId,
  type TestUser,
  today,
} from "../support/stack.ts";

const stack = localStack();
const cookie = (user: TestUser) =>
  user.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");

function record(body: unknown, key: string): { id: string; updatedAt: string } {
  const value =
    body !== null && typeof body === "object" && key in body
      ? (body as Record<string, unknown>)[key]
      : body;
  const id =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>).id : null;
  const updatedAt =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>).updatedAt
      : null;
  if (typeof id !== "string" || typeof updatedAt !== "string") {
    throw new Error(`Unexpected ${key} result shape.`);
  }
  return { id, updatedAt };
}

async function post(user: TestUser, path: string, input: unknown): Promise<unknown> {
  const response = await fetch(`${stack.webUrl}${path}`, {
    method: "POST",
    headers: { Origin: stack.webUrl, Cookie: cookie(user), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}.`);
  return response.json();
}

const finance = (user: TestUser, operation: string, input: unknown) =>
  post(user, `/api/finance/operations/${operation}`, input);

async function account(user: TestUser, name: string, lastFour: string) {
  return record(
    await finance(user, "create_financial_account", {
      name,
      institution: "Synthetic Bank",
      accountType: "bank",
      currency: "IDR",
      lastFour,
      clientRequestId: requestId(),
    }),
    "financialAccount",
  );
}

async function expense(
  user: TestUser,
  accountId: string,
  merchantName: string,
  amountMinor: string,
) {
  return record(
    await finance(user, "add_transaction", {
      kind: "expense",
      flowDirection: "out",
      merchantName,
      money: { amountMinor, currency: "IDR" },
      occurredOn: today(),
      occurredTime: null,
      description: null,
      location: null,
      accountHint: null,
      categoryId: null,
      financialAccountId: accountId,
      clientRequestId: requestId(),
    }),
    "transaction",
  );
}

async function goal(user: TestUser, name: string) {
  return record(
    await finance(user, "create_financial_goal", {
      name,
      target: { amountMinor: "5000000", currency: "IDR" },
      saved: { amountMinor: "0", currency: "IDR" },
      targetDate: "2027-06-30",
      clientRequestId: requestId(),
    }),
    "goal",
  );
}

async function uploadImage(user: TestUser, goalRecord: { id: string; updatedAt: string }) {
  const form = new FormData();
  const png = readFileSync(join(repoRoot(), "e2e/terminal/pixel.png"));
  form.set("image", new Blob([png], { type: "image/png" }), "goal.png");
  form.set("expectedUpdatedAt", goalRecord.updatedAt);
  const response = await fetch(`${stack.webUrl}/api/goals/${goalRecord.id}/image`, {
    method: "POST",
    headers: { Origin: stack.webUrl, Cookie: cookie(user) },
    body: form,
  });
  if (!response.ok) throw new Error(`Goal image upload failed with ${response.status}.`);
}

const [userA, userB, userF] = await Promise.all([
  createTestUser(stack, "A"),
  createTestUser(stack, "B"),
  createTestUser(stack, "F"),
]);
const accountA = await account(userA, "Everyday account", "1111");
const coffee = await expense(userA, accountA.id, "Kopi Tuku", "45000");
const goalA = await goal(userA, "Holiday in Bali");
const accountB = await account(userB, "B private account", "2222");
const clinic = await expense(userB, accountB.id, "B Private Clinic", "987000");
const goalB = await goal(userB, "B secret goal");
await uploadImage(userB, goalB);
const chatB = requestId();
await post(userB, "/api/chat", {
  conversationId: chatB,
  text: "How much did I spend today?",
  history: [],
});

const [webLog = "", agentLog = ""] = (process.env.E2E_LOG_FILES ?? "").split(",");
const values: Record<string, string> = {
  WEB: stack.webUrl,
  AGENT: stack.agentUrl,
  SUPA: stack.supabase.url,
  PUB: stack.supabase.publishableKey,
  SRK: stack.serviceRoleKey,
  SECRET: stack.agentSecret,
  KAPSO_SECRET: stack.kapsoWebhookSecret,
  PROD: "https://monara-finance.vercel.app",
  PROD_AGENT: process.env.E2E_PRODUCTION_AGENT_URL ?? "",
  WEB_LOG: webLog,
  AGENT_LOG: agentLog,
  A_ID: userA.id,
  B_ID: userB.id,
  A_EMAIL: userA.email,
  A_TOKEN: userA.accessToken,
  A_COOKIE: cookie(userA),
  B_COOKIE: cookie(userB),
  F_COOKIE: cookie(userF),
  A_ACCOUNT: accountA.id,
  A_TX: coffee.id,
  A_GOAL: goalA.id,
  A_GOAL_AT: goalA.updatedAt,
  B_ACCOUNT: accountB.id,
  B_ACCOUNT_AT: accountB.updatedAt,
  B_TX: clinic.id,
  B_TX_AT: clinic.updatedAt,
  B_GOAL: goalB.id,
  B_CHAT: chatB,
};
const directory = join(repoRoot(), "e2e/.results");
mkdirSync(directory, { recursive: true });
const path = join(directory, "terminal.env");
writeFileSync(
  path,
  `${Object.entries(values)
    .map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`)
    .join("\n")}\n`,
);
chmodSync(path, 0o600);
process.stdout.write(`Wrote ${Object.keys(values).length} values to e2e/.results/terminal.env\n`);

// Measures extraction accuracy per field on the labeled synthetic emails in extraction-set.ts,
// using the production extractor and a real model (PRD section 10).
// Usage: pnpm --filter @monara/agent sandbox:extraction [--json]
// Reads LLM_BASE_URL, LLM_API_KEY and LLM_MODEL from the environment or apps/agent/.dev.vars.
import { existsSync, readFileSync } from "node:fs";
import { createLlmClient, LlmError } from "../src/gmail/llm.ts";
import { extractTransactions } from "../src/gmail/parse/extract.ts";
import {
  type EmailCase,
  type ExpectedItem,
  emailCases,
  HOLDER,
  RECEIVED_AT,
} from "./extraction-set.ts";

function readSetting(name: string): string {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) return fromEnvironment;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim();
    if (value) return value;
  }
  throw new Error(`${name} is not set. Add it to apps/agent/.dev.vars.`);
}

const FIELDS = ["kind", "amount", "date", "merchant", "accountLastFour"] as const;
type Field = (typeof FIELDS)[number];

interface CaseResult {
  id: string;
  classified: boolean;
  /** Per expected item: which fields were right. Null when the item was not extracted at all. */
  items: (Record<Field, boolean> | null)[];
  spurious: number;
  failures: string[];
}

function byAmount<T extends { amountMinor?: string | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(a.amountMinor ?? Number.MAX_SAFE_INTEGER) -
      Number(b.amountMinor ?? Number.MAX_SAFE_INTEGER),
  );
}

function scoreItem(
  expected: ExpectedItem,
  got: Awaited<ReturnType<typeof extractTransactions>>["items"][number],
) {
  const merchantOk =
    expected.merchant === null
      ? true
      : (got.merchantName ?? "").toLowerCase().includes(expected.merchant.toLowerCase());
  return {
    kind: got.kind === expected.kind,
    amount: (got.money?.amountMinor ?? null) === expected.amountMinor,
    date: got.occurredOn === expected.occurredOn,
    merchant: merchantOk,
    accountLastFour: (got.accountLastFour ?? null) === expected.lastFour,
  } satisfies Record<Field, boolean>;
}

async function runCase(
  llm: ReturnType<typeof createLlmClient>,
  testCase: EmailCase,
): Promise<CaseResult> {
  const result = await extractTransactions(
    llm,
    {
      receivedAt: RECEIVED_AT,
      from: testCase.from,
      subject: testCase.subject,
      body: testCase.body,
    },
    { holderName: HOLDER, institutionName: testCase.institution },
  );
  const failures: string[] = [];
  const classified = result.isTransactionEmail === testCase.expect.isTransactionEmail;
  if (!classified) failures.push(`isTransactionEmail was ${result.isTransactionEmail}`);

  const expectedItems = byAmount(testCase.expect.items.map((item) => ({ ...item })));
  const gotItems = byAmount(
    result.items.map((item) => ({ item, amountMinor: item.money?.amountMinor ?? null })),
  );
  const items = expectedItems.map((expected, index) => {
    const got = gotItems[index]?.item;
    if (!got) {
      failures.push(`item ${index + 1} (${expected.amountMinor ?? "no amount"}) was not extracted`);
      return null;
    }
    const scores = scoreItem(expected, got);
    for (const field of FIELDS)
      if (!scores[field]) failures.push(`item ${index + 1}: ${field} was wrong`);
    return scores;
  });
  const spurious = Math.max(0, gotItems.length - expectedItems.length);
  if (spurious > 0) failures.push(`${spurious} extra item(s)`);
  return { id: testCase.id, classified, items, spurious, failures };
}

const llm = createLlmClient({
  baseUrl: readSetting("LLM_BASE_URL"),
  apiKey: readSetting("LLM_API_KEY"),
  model: readSetting("LLM_MODEL"),
});

const results: CaseResult[] = [];
for (const testCase of emailCases) {
  try {
    results.push(await runCase(llm, testCase));
  } catch (error) {
    // Only the failure kind and HTTP status: provider bodies can echo the prompt.
    const detail =
      error instanceof LlmError
        ? `${error.failure}, status ${error.status ?? "none"}`
        : String(error);
    results.push({
      id: testCase.id,
      classified: false,
      items: testCase.expect.items.map(() => null),
      spurious: 0,
      failures: [`extraction failed: ${detail}`],
    });
  }
}

const expectedItemCount = emailCases.reduce(
  (sum, testCase) => sum + testCase.expect.items.length,
  0,
);
const found = results.flatMap((result) => result.items).filter((item) => item !== null);
const summary = {
  model: readSetting("LLM_MODEL"),
  emails: emailCases.length,
  classifiedCorrectly: results.filter((result) => result.classified).length,
  expectedItems: expectedItemCount,
  itemsFound: found.length,
  extraItems: results.reduce((sum, result) => sum + result.spurious, 0),
  fieldCorrect: Object.fromEntries(
    FIELDS.map((field) => [field, found.filter((item) => item[field]).length]),
  ) as Record<Field, number>,
  failedCases: results
    .filter((result) => result.failures.length > 0)
    .map((result) => ({ id: result.id, failures: result.failures })),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify({ summary, results }, null, 2)}\n`);
} else {
  const line = (text: string) => process.stdout.write(`${text}\n`);
  line(`model ${summary.model}`);
  line(`emails classified correctly: ${summary.classifiedCorrectly}/${summary.emails}`);
  line(
    `items found: ${summary.itemsFound}/${summary.expectedItems} (extra: ${summary.extraItems})`,
  );
  for (const field of FIELDS)
    line(`${field}: ${summary.fieldCorrect[field]}/${summary.expectedItems}`);
  for (const failed of summary.failedCases)
    line(`FAIL ${failed.id}: ${failed.failures.join("; ")}`);
}

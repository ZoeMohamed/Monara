// Records the backend evidence as real terminal screenshots with VHS: every command
// below is typed into a bash shell and its actual output is captured, unedited.
// Usage (after `pnpm e2e` and `node e2e/terminal/setup.ts`): node e2e/terminal/run.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { evidenceDir } from "../support/evidence.ts";
import { repoRoot } from "../support/stack.ts";

interface Recording {
  id: string;
  caption: string;
  height: number;
  commands: string[];
}

const RECORDINGS: Recording[] = [
  {
    id: "SEC-01",
    caption:
      "Local stack, no session cookie: the private page redirects and every private API refuses.",
    height: 470,
    commands: [
      "# SEC-01  Signed-out requests: no session cookie at all",
      "curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\\n' $WEB/transactions",
      "call - POST /api/finance/operations/list_transactions '{}'",
      `call - POST /api/chat '{"text":"hi","history":[]}'`,
      "call - GET /api/chat/conversations",
      "call - GET /api/forecast",
      "call - GET /api/whatsapp/link",
      "call - GET /api/profile/status",
    ],
  },
  {
    id: "PROD-01",
    caption:
      "Hosted app, signed out: redirect to sign-in, 401 without a session, 403 from another site.",
    height: 360,
    commands: [
      "# PROD-01  Signed-out requests to the hosted app",
      "curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\\n' $PROD/transactions",
      `curl -s -X POST $PROD/api/finance/operations/list_transactions -H "Origin: $PROD" -w '\\n-> HTTP %{http_code}\\n'`,
      "curl -s -X POST $PROD/api/finance/operations/list_transactions -H 'Origin: https://evil.example' -w '\\n-> HTTP %{http_code}\\n'",
      "curl -s $PROD/api/chat/conversations -w '\\n-> HTTP %{http_code}\\n'",
      "curl -s $PROD/api/forecast -w '\\n-> HTTP %{http_code}\\n'",
    ],
  },
  {
    id: "SEC-02",
    caption:
      "Signed in as User A with User B's real IDs: only A's records come back, even from the database directly.",
    height: 450,
    commands: [
      "# SEC-02  Synthetic User A tries to read synthetic User B's data",
      `echo "A = $A_ID"; echo "B = $B_ID"`,
      "call A POST /api/finance/operations/list_transactions '{}' '[.items[] | {merchantName, amount: .money.amountMinor}]'",
      "call A GET /api/chat/conversations/$B_CHAT '' '{messages: (.messages | length)}'",
      "call B GET /api/chat/conversations/$B_CHAT '' '{messages: (.messages | length)}'",
      "call A GET /api/goals/$B_GOAL/image",
      "# The database itself, queried with A's own access token (row-level security)",
      `db_as A "transactions?select=merchant_name,user_id&user_id=eq.$B_ID"`,
    ],
  },
  {
    id: "SEC-03",
    caption:
      "User A sends edits and a delete for User B's records: all refused, and B's row is unchanged afterwards.",
    height: 545,
    commands: [
      "# SEC-03  Synthetic User A tries to change synthetic User B's data",
      `echo "B's transaction = $B_TX"`,
      `call A POST /api/finance/operations/edit_transaction '{"transactionId":"'$B_TX'","expectedUpdatedAt":"'$B_TX_AT'","changes":{"merchantName":"Hijacked"}}'`,
      `call A POST /api/finance/operations/delete_transaction '{"transactionId":"'$B_TX'","expectedUpdatedAt":"'$B_TX_AT'"}'`,
      `call A POST /api/finance/operations/update_financial_account '{"financialAccountId":"'$B_ACCOUNT'","expectedUpdatedAt":"'$B_ACCOUNT_AT'","changes":{"name":"Hijacked"}}'`,
      "# A direct database write with A's own token, even to A's own row",
      `db_as A "transactions?id=eq.$A_TX" PATCH '{"merchant_name":"Direct write"}'`,
      "# B's transaction afterwards (service-role read) and the time it was created",
      `db_admin "transactions?select=merchant_name,amount,updated_at,deleted_at&id=eq.$B_TX"`,
      `echo "created: $B_TX_AT"`,
    ],
  },
  {
    id: "SEC-04",
    caption:
      "User A's valid session cookie sent from another website is refused; the same request from Monara works.",
    height: 380,
    commands: [
      "# SEC-04  A's valid session cookie, sent from another website",
      `curl -s -X POST $WEB/api/finance/operations/list_categories -H "Cookie: $A_COOKIE" -H 'Origin: https://evil.example' -d '{}' -w '\\n-> HTTP %{http_code}\\n'`,
      `curl -s -X POST $WEB/api/finance/operations/list_categories -H "Cookie: $A_COOKIE" -H 'Sec-Fetch-Site: cross-site' -d '{}' -w '\\n-> HTTP %{http_code}\\n'`,
      `curl -s -X POST $WEB/api/finance/operations/list_categories -H "Cookie: $A_COOKIE" -d '{}' -w '\\n-> HTTP %{http_code}\\n'`,
      "# Control: the same request from Monara's own origin",
      "call A POST /api/finance/operations/list_categories '{}' '{categories: (.items | length)}'",
    ],
  },
  {
    id: "SEC-05",
    caption:
      "Agent-only routes refuse a missing or wrong secret. With the real secret the backend acts for any User named in the body: documented open risk 3.",
    height: 485,
    commands: [
      "# SEC-05  Agent-only routes on the web backend and the Worker",
      "agent none /api/agent/operations/list_transactions",
      "agent wrong /api/agent/operations/list_transactions",
      "agent none /api/agent/gmail/list-active-connections",
      "agent wrong /api/agent/account-deletions/process",
      `for p in /chat /gmail/sync /forecast/refine /users/purge; do curl -s -o /dev/null -w "worker $p -> %{http_code}\\n" -X POST $AGENT$p; done`,
      "# Documented open risk 3: the real secret alone can act for any User",
      `agent real /api/agent/operations/list_transactions '{"userId":"'$B_ID'","channel":"web","input":{}}' '[.items[].merchantName]'`,
    ],
  },
  {
    id: "SEC-06",
    caption:
      "After the chat flow above: the Bakmi GM expense is deleted only once the User said yes.",
    height: 160,
    commands: [
      "# SEC-06  The Bakmi GM expense in the database after Cancel, then Yes, delete",
      `db_admin "transactions?select=merchant_name,amount,deleted_at&id=eq.$UI_BAKMI_TX"`,
    ],
  },
  {
    id: "SEC-07",
    caption:
      "User A's records after the chat: nothing added or deleted, no Rp 99.000.000 income. The injected text is still only data.",
    height: 215,
    commands: [
      "# SEC-07  User A's records after asking the Agent about the record with hidden instructions",
      `db_admin "transactions?select=merchant_name,transaction_type,amount,deleted_at,description&user_id=eq.$UI_A_ID&order=created_at"`,
    ],
  },
  {
    id: "SEC-08",
    caption:
      "A fresh User sends 125 finance requests in one burst: 120 succeed, then 429 with Retry-After.",
    height: 245,
    commands: [
      "# SEC-08  Fresh synthetic User F sends 125 finance requests in one burst",
      `for i in $(seq 125); do curl -s -o /dev/null -w '%{http_code}\\n' -X POST $WEB/api/finance/operations/list_categories -H "Cookie: $F_COOKIE" -H "Origin: $WEB" -d '{}'; done | uniq -c`,
      `curl -s -D - -o /dev/null -X POST $WEB/api/finance/operations/list_categories -H "Cookie: $F_COOKIE" -H "Origin: $WEB" -d '{}' | grep -iE '^(HTTP|retry-after)'`,
    ],
  },
  {
    id: "SEC-09",
    caption:
      "Response headers of the hosted sign-in page. No Content-Security-Policy header is sent: documented open risk 5.",
    height: 320,
    commands: [
      "# SEC-09  Security headers sent by the hosted app",
      "curl -sI $PROD/sign-in | grep -iE '^(HTTP|strict-transport-security|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cache-control|content-security-policy)'",
      "# Number of Content-Security-Policy headers:",
      "curl -sI $PROD/sign-in | grep -ci '^content-security-policy'",
    ],
  },
  {
    id: "SEC-12",
    caption:
      "After User C deleted the account in the app: the old session is dead, the identity and records are gone, cleanup is finished.",
    height: 430,
    commands: [
      "# SEC-12  After synthetic User C deleted the account in the app (screens above)",
      `echo "C = $UI_C_ID"`,
      "call C_OLD GET /api/profile/status",
      "call C_OLD POST /api/finance/operations/list_transactions '{}'",
      "# C's sign-in identity and records (service-role reads)",
      `curl -s $SUPA/auth/v1/admin/users/$UI_C_ID -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -w '\\n-> HTTP %{http_code}\\n'`,
      `db_admin "transactions?select=id&user_id=eq.$UI_C_ID"`,
      `db_admin "user_deletions?select=user_id&user_id=eq.$UI_C_ID"`,
    ],
  },
  {
    id: "SEC-13",
    caption:
      "The WhatsApp webhook refuses a missing or wrong signature and accepts only a correct HMAC of the body.",
    height: 340,
    commands: [
      "# SEC-13  WhatsApp (Kapso) webhook on the Agent Worker",
      `BODY='{"synthetic":true}'`,
      `curl -s -X POST $AGENT/webhooks/kapso -H 'X-Webhook-Event: whatsapp.message.received' -d "$BODY" -w '\\n-> HTTP %{http_code}\\n'`,
      `curl -s -X POST $AGENT/webhooks/kapso -H 'X-Webhook-Event: whatsapp.message.received' -H "X-Webhook-Signature: $(printf '0%.0s' {1..64})" -d "$BODY" -w '\\n-> HTTP %{http_code}\\n'`,
      `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$KAPSO_SECRET" | awk '{print $2}')`,
      `curl -s -X POST $AGENT/webhooks/kapso -H 'X-Webhook-Event: whatsapp.status.updated' -H "X-Webhook-Signature: $SIG" -d "$BODY" -w '\\n-> HTTP %{http_code}\\n'`,
    ],
  },
  {
    id: "SEC-14",
    caption:
      "Goal images: the owner uploads and gets a short-lived signed link; another User gets 404; text named .png is rejected.",
    height: 360,
    commands: [
      "# SEC-14  Goal images: owner only, real images only",
      `curl -s -X POST $WEB/api/goals/$A_GOAL/image -H "Cookie: $A_COOKIE" -H "Origin: $WEB" -F 'image=@e2e/terminal/pixel.png;type=image/png' -F expectedUpdatedAt=$A_GOAL_AT -o /dev/null -w 'A uploads a PNG -> %{http_code}\\n'`,
      `curl -s $WEB/api/goals/$A_GOAL/image -H "Cookie: $A_COOKIE" -o /dev/null -w 'A reads it -> %{http_code} %{redirect_url}\\n' | sed -E 's/token=[^&]*/token=[hidden]/'`,
      `curl -s $WEB/api/goals/$A_GOAL/image -H "Cookie: $B_COOKIE" -o /dev/null -w 'B reads it -> %{http_code}\\n'`,
      "printf 'not really a png' > /tmp/fake.png",
      `curl -s -X POST $WEB/api/goals/$A_GOAL/image -H "Cookie: $A_COOKIE" -H "Origin: $WEB" -F 'image=@/tmp/fake.png;type=image/png' -F expectedUpdatedAt=$A_GOAL_AT -w '\\n-> HTTP %{http_code}\\n'`,
    ],
  },
  {
    id: "SEC-15",
    caption:
      "This run's web and Worker logs searched for every secret, token, email and private text the tests used: no matches.",
    height: 340,
    commands: [
      "# SEC-15  Search this run's web and Worker logs (counts only, values never printed)",
      `for v in SECRET KAPSO_SECRET SRK A_TOKEN A_EMAIL; do printf '%-14s %s matches\\n' "$v" "$(cat $WEB_LOG $AGENT_LOG | grep -cF -- "\${!v}")"; done`,
      `for t in 'B Private Clinic' 'Kopi Tuku' 'ignore all previous instructions' 'How much did I spend today'; do printf '%-34s %s matches\\n' "$t" "$(cat $WEB_LOG $AGENT_LOG | grep -cF -- "$t")"; done`,
    ],
  },
  {
    id: "PROD-05",
    caption: "Hosted Agent routes and the hosted Worker refuse callers without the real secret.",
    height: 305,
    commands: [
      "# PROD-05  Hosted Agent-only routes with a wrong secret, and the hosted Worker without one",
      `for p in /api/agent/operations/list_transactions /api/agent/gmail/list-active-connections /api/agent/account-deletions/process; do curl -s -o /dev/null -w "$p -> %{http_code}\\n" -X POST $PROD$p -H 'Authorization: Bearer wrong-secret'; done`,
      `for p in /chat /gmail/sync /users/purge; do curl -s -o /dev/null -w "worker $p -> %{http_code}\\n" -X POST $PROD_AGENT$p; done`,
      "curl -s $PROD_AGENT/health; echo",
    ],
  },
];

const root = repoRoot();
const tapes = join(root, "e2e/.results/vhs");
const output = join(evidenceDir, "terminal");
mkdirSync(tapes, { recursive: true });
mkdirSync(output, { recursive: true });

const only = process.argv.slice(2);
for (const recording of RECORDINGS.filter(
  (entry) => only.length === 0 || only.includes(entry.id),
)) {
  // Setup runs hidden: it loads the env files and helpers, whose values never reach the screen.
  const lines = [
    // VHS runs from the repository root; it does not accept absolute paths.
    `Output ${relative(root, join(tapes, `${recording.id}.gif`))}`,
    'Set Shell "bash"',
    "Set FontSize 15",
    "Set Width 1500",
    `Set Height ${recording.height}`,
    "Set Padding 26",
    "Set TypingSpeed 1ms",
    "Hide",
    `Type \`cd ${root} && source e2e/.results/terminal.env && { [ -f e2e/.results/ui.env ] && source e2e/.results/ui.env; true; } && source e2e/terminal/lib.sh && export PS1='$ ' && clear\``,
    "Enter",
    "Wait /\\$ *$/",
    "Show",
    ...recording.commands.flatMap((command) => [
      `Type \`${command}\``,
      "Enter",
      // Let the command start, then wait for a line that is only the prompt again,
      // so the next command is never typed while output is still arriving.
      "Sleep 300ms",
      "Wait@90s /^\\$ *$/",
    ]),
    "Sleep 500ms",
    `Screenshot ${relative(root, join(output, `${recording.id}.png`))}`,
    "Sleep 1s",
  ];
  const tape = join(tapes, `${recording.id}.tape`);
  writeFileSync(tape, `${lines.join("\n")}\n`);
  execFileSync("vhs", [tape], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  process.stdout.write(`recorded ${recording.id}\n`);
}
writeFileSync(
  join(output, "index.json"),
  `${JSON.stringify(
    RECORDINGS.map(({ id, caption, commands }) => ({
      id,
      caption,
      file: `terminal/${id}.png`,
      commands,
    })),
    null,
    2,
  )}\n`,
);

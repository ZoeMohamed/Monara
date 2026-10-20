// Builds one plain PDF from the recorded run: app screenshots exactly as captured and
// terminal screenshots exactly as recorded, with captions as ordinary document text.
// Also writes the evidence folder's README. Usage: node e2e/build-evidence-pdf.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { evidenceDir, RUN_DATE } from "./support/evidence.ts";
import { repoRoot } from "./support/stack.ts";

interface Check {
  label: string;
  detail: string;
  kind: "pass" | "fail" | "note";
}

interface Result {
  id: string;
  title: string;
  risk: string;
  environment: "local" | "production";
  environmentLabel: string;
  verdict: string;
  commit: string;
  recordedAt: string;
  shows: string;
  screenshots: { caption: string; file: string }[];
  checks: Check[];
}

interface TerminalShot {
  id: string;
  caption: string;
  file: string;
}

const SECTIONS: { name: string; ids: string[] }[] = [
  {
    name: "Identity and access",
    ids: ["PROD-01", "SEC-01", "SEC-04", "SEC-05", "PROD-05", "SEC-13"],
  },
  { name: "Data isolation", ids: ["SEC-02", "SEC-03", "SEC-14"] },
  { name: "Agent safety", ids: ["SEC-06", "SEC-07"] },
  { name: "Abuse and browser protection", ids: ["SEC-08", "SEC-09", "SEC-10"] },
  { name: "Deletion and privacy", ids: ["SEC-12", "SEC-15"] },
];

// Page geometry in millimetres (A4 landscape, 16 mm side margins).
const CONTENT_WIDTH = 265;
const IMAGE_AREA = 132;
const TERMINAL_WIDTH = 262;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const sentence = (value: string) =>
  `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/\.$/, "")}.`;

const root = repoRoot();
const file = (path: string) => pathToFileURL(join(evidenceDir, path)).href;
const asset = (path: string) => pathToFileURL(join(root, path)).href;
const output = join(evidenceDir, "Team808-Security-Test-Evidence.pdf");
const model = process.env.E2E_MODEL_LABEL ?? "the configured model";

const results = new Map<string, Result>(
  readdirSync(join(evidenceDir, "results"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(evidenceDir, "results", name), "utf8")) as Result)
    .map((result) => [result.id, result]),
);
const terminalIndex = join(evidenceDir, "terminal/index.json");
const terminal = new Map<string, TerminalShot>(
  existsSync(terminalIndex)
    ? (JSON.parse(readFileSync(terminalIndex, "utf8")) as TerminalShot[])
        .filter((shot) => existsSync(join(evidenceDir, shot.file)))
        .map((shot) => [shot.id, shot])
    : [],
);
const ordered = SECTIONS.flatMap((section) =>
  section.ids.map((id) => {
    const result = results.get(id);
    if (!result) throw new Error(`Missing results for ${id}. Run pnpm e2e first.`);
    return { section: section.name, result };
  }),
);
if (ordered.length !== results.size)
  throw new Error("Every recorded test must belong to a section.");

const all = [...results.values()];
const passed = all.filter((result) => result.verdict === "PASS").length;
const local = all.filter((result) => result.environment === "local").length;
const commits = [...new Set(all.map((result) => result.commit.replace(" (deployed)", "")))].join(
  ", ",
);
const times = all.map((result) => result.recordedAt).sort();
const notes = all.flatMap((result) =>
  result.checks
    .filter((check) => check.kind === "note" && /open risk/i.test(`${check.label} ${check.detail}`))
    .map((check) => ({ id: result.id, check })),
);
/** Only notes that name a documented open risk are risks; others are context. */
const isRisk = (check: Check) => /open risk/i.test(`${check.label} ${check.detail}`);
const noteText = (check: Check) =>
  sentence(`${check.label.replace(/^Documented open risk: /, "")}: ${check.detail}`);

/** Natural pixel size of a PNG, read from its header. */
function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(join(evidenceDir, path)).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

interface PageBody {
  section: string;
  body: string;
}

function testPages(section: string, result: Result): PageBody[] {
  const shot = terminal.get(result.id);
  const size = shot ? pngSize(shot.file) : null;
  const terminalHeight = size ? (TERMINAL_WIDTH * size.height) / size.width : 0;
  const phones = result.screenshots;
  const checks = result.checks.filter((check) => check.kind !== "note");
  const head = `<div class="title"><h2>${result.id} · ${escapeHtml(result.title)}</h2>
    <p class="meta">${escapeHtml(result.risk)} · ${escapeHtml(result.environmentLabel)} · commit ${escapeHtml(result.commit)} · ${escapeHtml(result.recordedAt)} · <b class="${result.verdict === "PASS" ? "ok" : "bad"}">${result.verdict}</b> (${checks.filter((check) => check.kind === "pass").length} of ${checks.length} automated checks)</p>
    <p>${escapeHtml(result.shows)}</p></div>`;
  const noteLines = result.checks
    .filter((check) => check.kind === "note")
    .map(
      (check) =>
        `<p class="note">${isRisk(check) ? "Documented open risk shown by this test" : "Note"}: ${escapeHtml(noteText(check))}</p>`,
    )
    .join("");
  const phoneRow = (height: number) =>
    `<div class="phones">${phones
      .map(
        (phone) =>
          `<figure style="width:${(height * 390) / 844}mm"><img style="height:${height}mm" src="${file(phone.file)}" alt="${escapeHtml(phone.caption)}"><figcaption>${escapeHtml(phone.caption)}</figcaption></figure>`,
      )
      .join("")}</div>`;
  const terminalBlock = shot
    ? `<figure class="term"><img style="width:${TERMINAL_WIDTH}mm" src="${file(shot.file)}" alt="${escapeHtml(shot.caption)}"><figcaption>Terminal, real commands and output: ${escapeHtml(shot.caption)}</figcaption></figure>`
    : "";
  const phonesWidth = (height: number) => phones.length * ((height * 390) / 844 + 6);
  if (phones.length > 0 && shot && IMAGE_AREA - terminalHeight - 12 >= 70) {
    const height = Math.min(IMAGE_AREA - terminalHeight - 12, 110);
    return [{ section, body: `${head}${phoneRow(height)}${terminalBlock}${noteLines}` }];
  }
  if (phones.length > 0) {
    let height = 118;
    while (phonesWidth(height) > CONTENT_WIDTH && height > 60) height -= 4;
    const first = { section, body: `${head}${phoneRow(height)}${shot ? "" : noteLines}` };
    return shot ? [first, { section, body: `${head}${terminalBlock}${noteLines}` }] : [first];
  }
  return [{ section, body: `${head}${terminalBlock}${noteLines}` }];
}

const bodies = ordered.flatMap(({ section, result }) => testPages(section, result));
const FRONT_PAGES = 5;
const totalPages = FRONT_PAGES + bodies.length;
const header = (section: string) =>
  `<div class="bar"><span>Monara · Security Test Evidence</span><span>${escapeHtml(section)}</span></div>`;
const footer = (page: number) =>
  `<div class="foot"><span>Team 808 · FinTechathon 2026</span><span>${page} / ${totalPages}</span></div>`;

const resultRows = SECTIONS.map(
  (section) =>
    `<tr class="group"><td colspan="5">${escapeHtml(section.name)}</td></tr>${section.ids
      .map((id) => {
        const result = results.get(id) as Result;
        const screens = result.screenshots.length;
        const evidence = [
          screens > 0 ? `${screens} app screen${screens > 1 ? "s" : ""}` : "",
          terminal.has(id) ? "terminal" : "",
        ]
          .filter(Boolean)
          .join(" + ");
        return `<tr><td class="id">${id}</td><td>${escapeHtml(result.title)}</td><td>${result.environment === "local" ? "Local synthetic" : "Production, read-only"}</td><td>${evidence}</td><td class="${result.verdict === "PASS" ? "ok" : "bad"}">${result.verdict}</td></tr>`;
      })
      .join("")}`,
).join("");

const libSource = readFileSync(join(root, "e2e/terminal/lib.sh"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .trim();

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Monara Security Test Evidence</title><style>
  @font-face { font-family: "Nunito Sans"; font-weight: 200 900; src: url("${asset("apps/web/public/fonts/nunito-sans-latin-variable.woff2")}") format("woff2"); }
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Nunito Sans", sans-serif; color: #111827; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 297mm; height: 210mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; padding: 0 16mm; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .bar { height: 12mm; display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 2mm; border-bottom: .3mm solid #d1d5db; font-size: 8.5pt; color: #6b7280; }
  .foot { position: absolute; left: 16mm; right: 16mm; bottom: 0; height: 9mm; display: flex; align-items: center; justify-content: space-between; border-top: .3mm solid #d1d5db; font-size: 8.5pt; color: #6b7280; }
  h1 { font-size: 34pt; font-weight: 900; margin-top: 8mm; }
  h2 { font-size: 15pt; font-weight: 900; }
  .title { margin: 4mm 0 3mm; }
  .title p { margin-top: 1mm; line-height: 1.4; }
  .meta { color: #4b5563; font-size: 9pt; }
  .ok { color: #15803d; font-weight: 900; }
  .bad { color: #b91c1c; font-weight: 900; }
  .note { margin-top: 2mm; color: #92400e; }
  .phones { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 3mm; }
  figure img { display: block; }
  .phones figure img { border: .2mm solid #d1d5db; }
  figcaption { font-size: 8.5pt; color: #374151; margin-top: 1.5mm; line-height: 1.35; }
  .term { margin-bottom: 2mm; }
  .cover { display: flex; flex-direction: column; padding-top: 24mm; padding-bottom: 20mm; }
  .cover .logo { height: 11mm; align-self: flex-start; }
  .cover .lead { font-size: 13pt; margin-top: 4mm; max-width: 210mm; line-height: 1.45; color: #374151; }
  .facts { margin-top: 12mm; font-size: 11pt; line-height: 1.9; }
  .facts b { display: inline-block; width: 46mm; color: #4b5563; font-weight: 700; }
  .cover .fine { margin-top: auto; font-size: 9pt; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 9.6pt; margin-top: 3mm; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; padding: 1.5mm 2.5mm; border-bottom: .4mm solid #111827; }
  td { padding: 1.05mm 2.5mm; border-bottom: .2mm solid #e5e7eb; vertical-align: top; }
  tr.group td { font-weight: 800; padding-top: 2.2mm; border-bottom: none; }
  td.id { font-weight: 800; white-space: nowrap; }
  .cols { display: flex; gap: 10mm; margin-top: 3mm; }
  .cols > div { flex: 1; }
  .prose p, .prose li { line-height: 1.5; }
  .prose p + p { margin-top: 2.5mm; }
  .prose ul { padding-left: 5mm; margin-top: 1.5mm; }
  .prose li + li { margin-top: 1.2mm; }
  h3 { font-size: 11pt; font-weight: 900; margin: 3mm 0 1.5mm; }
  pre { font-family: ui-monospace, Menlo, monospace; font-size: 7.4pt; line-height: 1.4; background: #f3f4f6; padding: 3mm 4mm; white-space: pre-wrap; }
  pre.code { column-count: 2; column-gap: 8mm; font-size: 7.6pt; }
</style></head><body>

<section class="page cover">
  <img class="logo" src="${asset("apps/web/public/logos/monara-lockup-light.svg")}" alt="Monara">
  <h1>Security Test Evidence</h1>
  <p class="lead">Automated end-to-end security tests of Monara. The evidence is unedited screenshots of the app and unedited screenshots of the terminal commands that were run against the backend.</p>
  <div class="facts">
    <div><b>Result</b>${passed} of ${all.length} tests passed</div>
    <div><b>Where</b>${local} on a local synthetic stack, ${all.length - local} against the hosted app (read-only)</div>
    <div><b>Code tested</b>commit ${escapeHtml(commits)} (also the commit deployed in production)</div>
    <div><b>Recorded</b>${escapeHtml(times[0].replace(" UTC", ""))} to ${escapeHtml(times.at(-1)?.slice(11) ?? "")}</div>
    <div><b>Team</b>Team 808 · FinTechathon 2026 · International AI Track</div>
  </div>
  <p class="fine">All Users and records are synthetic. The hosted app was only sent signed-out requests or requests with a wrong secret.</p>
</section>

<section class="page">${header("Results")}
  <div class="title"><h2>Results</h2><p>Each test was checked automatically. The pages that follow show its evidence.</p></div>
  <table><thead><tr><th>Test</th><th>What it checks</th><th>Where</th><th>Evidence</th><th>Result</th></tr></thead><tbody>${resultRows}</tbody></table>
  ${footer(2)}
</section>

<section class="page">${header("Method")}
  <div class="title"><h2>How the tests and the evidence were produced</h2></div>
  <div class="cols prose">
    <div>
      <p><b>Automated checks.</b> Playwright (Chrome) runs every test and decides pass or fail. Local tests use a disposable copy of Monara on commit ${escapeHtml(commits)}: a local Supabase database with every migration, a production build of the web app and the local Agent Worker. Synthetic Users are created and seeded through Monara's own APIs.</p>
      <p><b>App screenshots.</b> Taken by Playwright at a 390 × 844 phone viewport, exactly as the app showed them. Nothing is drawn on them.</p>
      <p><b>Terminal screenshots.</b> Recorded with VHS: each command was typed into a real bash shell and the screen was captured with its real output. A hidden first line loads the session values and the helpers shown here, so cookies, tokens and keys appear only as variable names.</p>
    </div>
    <div>
      <p><b>Agent tests.</b> SEC-06 and SEC-07 use the real model (${escapeHtml(model)}). Each is one recorded run.</p>
      <p><b>Stated stand-ins.</b> Account deletion's last step checks Composio for leftover connections; locally a stand-in reports none, and the every-minute cleanup schedule is triggered by the test.</p>
      <p><b>Reproduce.</b> Start the local stack (pnpm worktree:bootstrap, a production build of the web app and pnpm dev:agent), then run pnpm e2e, pnpm e2e:terminal and pnpm e2e:pdf.</p>
    </div>
  </div>
  ${footer(3)}
</section>

<section class="page">${header("Terminal helpers")}
  <div class="title"><h2>The terminal helpers, in full</h2><p>The terminal screenshots call these functions from e2e/terminal/lib.sh. Each is a plain curl request; the values they read are loaded from ignored files and never printed.</p></div>
  <pre class="code">${escapeHtml(libSource)}</pre>
  ${footer(4)}
</section>

<section class="page">${header("Open risks and limits")}
  <div class="title"><h2>What the results do and do not show</h2></div>
  <div class="cols prose">
    <div><h3>Open risks the tests confirm</h3><ul>${notes
      .map(({ id, check }) => `<li><b>${id}:</b> ${escapeHtml(noteText(check))}</li>`)
      .join(
        "",
      )}</ul><p style="margin-top:2mm">These are already listed in the Security Self-Assessment and are never counted as passes.</p></div>
    <div><h3>Not covered by this run</h3><ul>
      <li>Real Google sign-in, a real Gmail mailbox, Composio and Kapso. Synthetic Users and a Composio stand-in were used locally.</li>
      <li>The Gmail auto-confirm rule and WhatsApp end to end.</li>
      <li>Signed-in checks on the hosted app. Production checks are signed-out by design, so signed-in screens come from the local stack.</li>
      <li>Repeated model runs. SEC-06 and SEC-07 are one recorded run each.</li></ul></div>
  </div>
  ${footer(5)}
</section>
${bodies
  .map(
    (entry, index) =>
      `<section class="page">${header(entry.section)}${entry.body}${footer(index + FRONT_PAGES + 1)}</section>`,
  )
  .join("\n")}
</body></html>`;

// Opened from disk so the local font, logo and screenshots load as file:// resources.
const scratch = join(root, "e2e/.results");
mkdirSync(scratch, { recursive: true });
const htmlPath = join(scratch, "security-test-evidence.html");
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready.then(() => undefined));
await page.pdf({
  path: output,
  format: "A4",
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();

// The Markdown version of the same evidence: every test with its explanation and the
// unedited screenshots, for reading on GitHub without the PDF.
const markdownTest = (result: Result): string[] => {
  const shot = terminal.get(result.id);
  const checks = result.checks.filter((check) => check.kind !== "note");
  const lines = [
    `### ${result.id} · ${result.title}`,
    "",
    `**${result.verdict}** (${checks.filter((check) => check.kind === "pass").length} of ${checks.length} automated checks) · ${result.risk} · ${result.environmentLabel} · commit ${result.commit} · ${result.recordedAt}`,
    "",
    result.shows,
    "",
  ];
  if (result.screenshots.length > 0) {
    lines.push(
      result.screenshots
        .map(
          (phone) =>
            `<img src="${phone.file}" width="240" alt="${phone.caption.replace(/"/g, "'")}">`,
        )
        .join(" "),
      "",
      ...result.screenshots.map((phone, index) => `${index + 1}. ${phone.caption}`),
      "",
    );
  }
  if (shot) {
    lines.push(
      `![${shot.caption}](${shot.file})`,
      "",
      `Terminal, real commands and output: ${shot.caption}`,
      "",
    );
  }
  for (const check of result.checks.filter((entry) => entry.kind === "note")) {
    lines.push(
      `> ${isRisk(check) ? "Documented open risk shown by this test" : "Note"}: ${noteText(check)}`,
      "",
    );
  }
  lines.push(
    "Automated checks:",
    "",
    ...checks.map(
      (check) =>
        `- ${check.kind === "pass" ? "Passed" : "Failed"}: ${check.label} (${check.detail})`,
    ),
    "",
  );
  return lines;
};

writeFileSync(
  join(evidenceDir, "README.md"),
  [
    `# Security end-to-end evidence, ${RUN_DATE}`,
    "",
    `**${passed} of ${all.length} tests passed.** Local tests ran on commit ${commits}, which was also the commit deployed in production. Recorded ${times[0].replace(" UTC", "")} to ${times.at(-1)?.slice(11) ?? ""}.`,
    "",
    "The evidence is only two kinds of image, both unedited: screenshots of the Monara app taken by Playwright at a 390 × 844 phone viewport, and screenshots of a real bash terminal recorded with VHS, showing the exact commands run against the backend and their output. Nothing is drawn on them.",
    "",
    `${local} tests ran on a disposable local copy of Monara (local Supabase with every migration, a production build of the web app and the local Agent Worker) with synthetic Users A, B and C. ${all.length - local} tests sent only signed-out, read-only requests to the hosted app at https://monara-finance.vercel.app. Signed-in screens therefore come from the local copy.`,
    "",
    "## Results",
    "",
    "| Test | What it checks | Where | Result |",
    "| --- | --- | --- | --- |",
    ...ordered.map(
      ({ result }) =>
        `| [${result.id}](#${result.id.toLowerCase()}--${result.title
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .replace(
            / /g,
            "-",
          )}) | ${result.title} | ${result.environment === "local" ? "Local synthetic" : "Production, read-only"} | ${result.verdict} |`,
    ),
    "",
    "## Open risks the tests confirm",
    "",
    ...notes.map(({ id, check }) => `- **${id}:** ${noteText(check)}`),
    "",
    "These are already listed in the Security Self-Assessment and are never counted as passes.",
    "",
    "## Not covered by this run",
    "",
    "- Real Google sign-in, a real Gmail mailbox, Composio and Kapso. Synthetic Users and a Composio stand-in were used locally.",
    "- The Gmail auto-confirm rule and WhatsApp end to end.",
    "- Signed-in checks on the hosted app.",
    `- Repeated model runs. SEC-06 and SEC-07 use the real model (${model}) and are one recorded run each.`,
    "",
    ...SECTIONS.flatMap((section) => [
      `## ${section.name}`,
      "",
      ...section.ids.flatMap((id) => markdownTest(results.get(id) as Result)),
    ]),
    "## How the evidence was produced",
    "",
    "- **Automated checks:** Playwright (Chrome) runs every test and decides pass or fail (`e2e/security.spec.ts`, `e2e/production.spec.ts`). Each test's checks are in `results/<ID>.json`, with record IDs masked and no cookies, tokens or keys.",
    "- **Terminal screenshots:** `e2e/terminal/run.ts` types each command into a real bash shell with VHS and captures the screen. A hidden first line loads session values and the helpers below from ignored files, so secrets appear only as variable names. `terminal/index.json` lists every command.",
    "- **Stated stand-ins:** account deletion's last step checks Composio for leftover connections; locally a stand-in reports none, and the every-minute cleanup schedule is triggered by the test.",
    "- **Reproduce:** start the local stack (`pnpm worktree:bootstrap`, a production build of the web app, `pnpm dev:agent`), then `pnpm e2e`, `pnpm e2e:terminal` and, for the PDF version, `pnpm e2e:pdf`.",
    "",
    "The terminal helpers (`e2e/terminal/lib.sh`):",
    "",
    "```bash",
    libSource,
    "```",
    "",
  ].join("\n"),
);
process.stdout.write(`Wrote ${output} (${totalPages} pages, ${passed}/${all.length} passed)\n`);

// Builds the three submission PDFs from docs/tech: technical documentation, security self-assessment
// and execution evidence. Needs Pandoc and Typst; Mermaid CLI is needed only for a selected
// document that contains a Mermaid diagram.
//
//   pnpm docs:pdf               build all three into docs/tech/build
//   pnpm docs:pdf --final       also fail on leftover TODOs and a status below Reviewed
//   pnpm docs:pdf security      build one of: technical, security, evidence
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const techDir = join(root, "docs", "tech");
const pdfDir = join(techDir, "pdf");
const buildDir = join(techDir, "build");
const workDir = join(buildDir, "work");
const REPO_URL = "https://github.com/ZoeMohamed/Monara";

const args = process.argv.slice(2);
const isFinal = args.includes("--final");
const only = args.filter((arg) => !arg.startsWith("--"));

/** One submission PDF. `parts` group the section files of the technical documentation. */
const DOCUMENTS = {
  technical: {
    output: "Team808-Technical-Documentation.pdf",
    kind: "Technical Documentation",
    subtitle: "Ideal system architecture, financial rules and security design",
    toc: true,
    files: ["technical-documentation"],
  },
  security: {
    output: "Team808-Security-Self-Assessment.pdf",
    kind: "Security Self-Assessment",
    subtitle: "Ideal control model, assurance criteria and residual risks",
    toc: true,
    files: ["security-self-assessment"],
  },
  evidence: {
    output: "Team808-Execution-Evidence.pdf",
    kind: "Execution Evidence",
    subtitle: "Ideal acceptance cases, evidence rules and release sign-off",
    toc: true,
    files: ["execution-evidence"],
  },
};

function fail(message) {
  console.error(`build-submission-pdfs: ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  try {
    return execFileSync(command, commandArgs, { cwd: root, encoding: "utf8", ...options });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`${command} failed:\n${detail}`);
  }
}

for (const tool of ["pandoc", "typst"]) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" });
  } catch {
    fail(`${tool} is not installed or not on the PATH.`);
  }
}
for (const name of only) {
  if (!DOCUMENTS[name])
    fail(`unknown document "${name}". Use: ${Object.keys(DOCUMENTS).join(", ")}.`);
}

/** Which PDF each section file lands in, so links across PDFs can say where to look. */
const homeOf = new Map();
for (const [id, doc] of Object.entries(DOCUMENTS)) {
  for (const file of doc.parts ? doc.parts.flatMap((part) => part.files) : doc.files) {
    homeOf.set(file, id);
  }
}

/** A section is ready when its Status line says Reviewed or Final. */
const REVIEWED = /\b(reviewed|final)\b/i;
const problems = [];
const warnings = [];

/** Applies `edit` to every line outside fenced code blocks. */
function mapOutsideFences(markdown, edit) {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : edit(line);
    })
    .join("\n");
}

/** The page body is about 16.6 cm wide and 21 cm tall. A diagram that would be taller is sized by height. */
function diagramSize(png) {
  const header = readFileSync(png).subarray(16, 24);
  const aspect = header.readUInt32BE(4) / header.readUInt32BE(0);
  return aspect * 16.6 > 20 ? "height=20cm" : "width=100%";
}

function renderMermaid(markdown, name) {
  let count = 0;
  return markdown.replace(/```mermaid\n([\s\S]*?)```/g, (_match, source) => {
    count += 1;
    const hash = createHash("sha1").update(source).digest("hex").slice(0, 10);
    const base = join(workDir, `${name}-${count}-${hash}`);
    const png = `${base}.png`;
    if (!existsSync(png)) {
      writeFileSync(`${base}.mmd`, source);
      run("mmdc", [
        "-i",
        `${base}.mmd`,
        "-o",
        png,
        "-c",
        join(pdfDir, "mermaid.json"),
        "-s",
        "3",
        "-b",
        "white",
        "--quiet",
      ]);
    }
    const rootPath = `/${relative(root, png).split("\\").join("/")}`;
    return `![Diagram ${count}: ${name}](${rootPath}){${diagramSize(png)}}`;
  });
}

/** Points repository links at GitHub, section links at anchors, and other-PDF links at a pointer. */
function rewriteLinks(markdown, file, docId) {
  const sourceDir = posix.dirname(`docs/tech/${file}.md`);
  return mapOutsideFences(markdown, (line) =>
    line.replace(/\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (match, target) => {
      if (/^(https?:|mailto:|#|xdoc:)/.test(target)) return match;
      const [pathPart, fragment] = target.split("#");
      const repoPath = posix.normalize(posix.join(sourceDir, pathPart));
      if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(repoPath)) {
        if (!existsSync(join(root, repoPath))) {
          warnings.push(`${file}.md links to ${repoPath}, which does not exist`);
        }
        return `](/${repoPath}${fragment ? `#${fragment}` : ""})`;
      }
      const section = repoPath.match(/^docs\/tech\/([a-z-]+)\.md$/)?.[1];
      if (section && homeOf.has(section)) {
        const home = homeOf.get(section);
        return home === docId ? `](#sec-${section})` : `](xdoc:${home})`;
      }
      if (!existsSync(join(root, repoPath))) {
        warnings.push(`${file}.md links to ${repoPath}, which does not exist`);
        return match;
      }
      const kind = statSync(join(root, repoPath)).isDirectory() ? "tree" : "blob";
      return `](${REPO_URL}/${kind}/main/${repoPath}${fragment ? `#${fragment}` : ""})`;
    }),
  );
}

/** Reads one section file and returns its title, byline and body, with headings shifted by `shift`. */
function loadSection(file, docId, shift) {
  const path = join(techDir, `${file}.md`);
  if (!existsSync(path)) fail(`docs/tech/${file}.md does not exist.`);
  let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  const title = text.match(/^# (.+)$/m)?.[1];
  const meta = text.match(/^Owner: (.+?)\. Features: (.+?)\. Status: (.+?)\.$/m);
  if (!title || !meta) fail(`docs/tech/${file}.md is missing its title or Owner line.`);
  text = text.replace(/^# .+\n+/m, "").replace(/^Owner: .+\n+/m, "");

  const [, owner, features, status] = meta;
  const todos =
    mapOutsideFences(text, (line) => (/\bTODO\b/.test(line) ? "@@TODO@@" : "")).split("@@TODO@@")
      .length - 1;
  if (todos > 0) warnings.push(`${file}.md still has ${todos} TODO line(s)`);
  if (isFinal) {
    if (todos > 0) problems.push(`${file}.md still has ${todos} TODO line(s)`);
    if (!REVIEWED.test(status)) problems.push(`${file}.md has status ${status}`);
  } else if (!REVIEWED.test(status)) {
    warnings.push(`${file}.md status is ${status}`);
  }

  text = rewriteLinks(text, file, docId);
  text = renderMermaid(text, file);
  text = mapOutsideFences(text, (line) =>
    line.replace(
      /^(#{1,6}) /,
      (_m, hashes) => `${"#".repeat(Math.max(1, Math.min(6, hashes.length + shift)))} `,
    ),
  );
  return { title, owner, features, body: text.trim(), todos };
}

/** Returns the markdown for one PDF. A single-file PDF also returns its owner and features for the cover. */
function composeMarkdown(id, doc) {
  const chunks = [];
  let cover = {};
  if (doc.parts) {
    doc.parts.forEach((part) => {
      chunks.push(`# ${part.title}\n\n${part.intro}\n`);
      for (const file of part.files) {
        const section = loadSection(file, id, 1);
        chunks.push(
          `## ${section.title} {#sec-${file}}\n\n*Features ${section.features}. Owner: ${section.owner}.*\n\n${section.body}\n`,
        );
      }
    });
  } else {
    for (const file of doc.files) {
      const section = loadSection(file, id, -1);
      cover = { owner: section.owner, features: section.features };
      chunks.push(`${section.body}\n`);
    }
  }
  return { markdown: chunks.join("\n"), cover };
}

const today = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
}).format(new Date());

mkdirSync(workDir, { recursive: true });

for (const [id, doc] of Object.entries(DOCUMENTS)) {
  if (only.length > 0 && !only.includes(id)) continue;
  const { markdown, cover } = composeMarkdown(id, doc);
  const mdPath = join(workDir, `${id}.md`);
  const typPath = join(workDir, `${id}.typ`);
  writeFileSync(mdPath, markdown);

  run("pandoc", [
    "-f",
    "gfm+attributes+raw_attribute",
    "-t",
    "typst",
    "--syntax-highlighting=none",
    "--wrap=none",
    `--template=${join(pdfDir, "monara.typst")}`,
    `--lua-filter=${join(pdfDir, "links.lua")}`,
    ...(doc.toc ? ["--toc"] : []),
    ...(doc.parts
      ? []
      : ["-V", "flow=true", "-V", `owner=${cover.owner}`, "-V", `features=${cover.features}`]),
    "-V",
    "title=Monara",
    "-V",
    `kind=${doc.kind}`,
    "-V",
    `subtitle=${doc.subtitle}`,
    "-V",
    `date=${today}`,
    "-V",
    `version=${isFinal ? "Final" : "Draft"}`,
    "-o",
    typPath,
    mdPath,
  ]);

  const output = join(buildDir, doc.output);
  run("typst", ["compile", "--root", root, "--font-path", join(pdfDir, "fonts"), typPath, output]);
  console.log(`built ${relative(root, output)}`);
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) for --final:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

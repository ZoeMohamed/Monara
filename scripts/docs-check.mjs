// Checks that every docs/tech section has the required structure.
// Run with --final before the submission freeze: it also fails on leftover TODOs and unfinished status.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "tech");
const isFinal = process.argv.includes("--final");
const REQUIRED_HEADINGS = [
  "Purpose",
  "How it works",
  "Key decisions",
  "Security and risks",
  "How to verify",
];
const SKIPPED = new Set(["README.md", "_template.md"]);

const readme = readFileSync(join(dir, "README.md"), "utf8");
const problems = [];

for (const file of readdirSync(dir)) {
  if (!file.endsWith(".md") || SKIPPED.has(file)) continue;
  const text = readFileSync(join(dir, file), "utf8");
  const headings = new Set([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim()));

  for (const heading of REQUIRED_HEADINGS) {
    if (!headings.has(heading)) problems.push(`${file}: missing the "## ${heading}" section`);
  }
  if (!/^Owner: .+\. Features: .+\. Status: .+\.$/m.test(text)) {
    problems.push(`${file}: missing the "Owner, Features, Status" line`);
  }
  if (!readme.includes(`(${file})`)) problems.push(`${file}: not listed in docs/tech/README.md`);

  if (isFinal) {
    if (/\bTODO\b/.test(text)) problems.push(`${file}: still contains TODO`);
    if (/Status: (Not started|Draft)\./.test(text)) {
      problems.push(`${file}: status must be Reviewed or Final`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error(`docs:check found ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`docs:check passed${isFinal ? " (final)" : ""}.`);

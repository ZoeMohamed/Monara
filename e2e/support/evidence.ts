// Evidence records for the security suite. Screenshots are unedited captures of the
// app at a 390 × 844 phone viewport; nothing is drawn on or around them. Each test's
// checks are written to results/<ID>.json. Cookies, tokens and keys are never recorded.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { repoRoot } from "./stack.ts";

export const RUN_DATE = "2026-10-20";
export const evidenceDir = join(repoRoot(), "docs/tech/evidence", `security-e2e-${RUN_DATE}`);
const uiEnvPath = join(repoRoot(), "e2e/.results/ui.env");

type Environment = "local" | "production";

const ENVIRONMENT_LABEL: Record<Environment, string> = {
  local: "Local synthetic stack (not production)",
  production: "Production, read-only requests",
};

function commitLabel(): string {
  const run = (args: string[]) =>
    execFileSync("git", args, { cwd: repoRoot(), encoding: "utf8" }).trim();
  const sha = run(["rev-parse", "--short", "HEAD"]);
  const appChanges = run(["status", "--porcelain", "--", "apps", "packages", "supabase"]);
  return appChanges ? `${sha} with uncommitted app changes` : `${sha}`;
}

/** Starts a fresh ui.env, which hands the UI tests' record IDs to the terminal evidence. */
export function resetUiFixtures(): void {
  mkdirSync(join(repoRoot(), "e2e/.results"), { recursive: true });
  writeFileSync(uiEnvPath, "", { mode: 0o600 });
}

export function uiFixture(name: string, value: string): void {
  appendFileSync(uiEnvPath, `export ${name}='${value.replace(/'/g, "'\\''")}'\n`);
}

interface Check {
  label: string;
  detail: string;
  /** "note" records a documented open risk or context; it never counts as a pass. */
  kind: "pass" | "fail" | "note";
}

export interface EvidenceMeta {
  id: string;
  title: string;
  risk: string;
  environment: Environment;
  shows: string;
  limits: string;
}

export class Evidence {
  private readonly checks: Check[] = [];
  private readonly shots: { caption: string; file: string }[] = [];
  private readonly log: { step: string; method: string; path: string; status: number }[] = [];

  // Plain fields rather than parameter properties, so Node can strip the types directly.
  private readonly meta: EvidenceMeta;

  constructor(_testInfo: TestInfo, meta: EvidenceMeta) {
    this.meta = meta;
  }

  /** Records a check and fails the test softly, so the remaining checks still run. */
  check(label: string, detail: string, pass: boolean): void {
    this.checks.push({ label, detail, kind: pass ? "pass" : "fail" });
    expect.soft(pass, `${label}: ${detail}`).toBe(true);
  }

  /** Records a documented open risk or context line. */
  note(label: string, detail: string): void {
    this.checks.push({ label, detail, kind: "note" });
  }

  /** Records a request outcome for the sanitized request log (no headers or bodies). */
  request(step: string, method: string, path: string, status: number): void {
    this.log.push({ step, method, path: path.replace(/[0-9a-f-]{36}/g, "<uuid>"), status });
  }

  /** Saves an unedited screenshot of the app as it is on screen. */
  async shot(page: Page, name: string, caption: string): Promise<void> {
    mkdirSync(join(evidenceDir, "screens"), { recursive: true });
    const file = `screens/${this.meta.id}-${this.shots.length + 1}-${name}.png`;
    await page.screenshot({ path: join(evidenceDir, file) });
    this.shots.push({ caption, file });
  }

  get passed(): boolean {
    const verdicts = this.checks.filter((check) => check.kind !== "note");
    return verdicts.length > 0 && verdicts.every((check) => check.kind === "pass");
  }

  finish(): void {
    mkdirSync(join(evidenceDir, "results"), { recursive: true });
    const commit =
      this.meta.environment === "production"
        ? `${process.env.E2E_PRODUCTION_COMMIT || "not recorded"} (deployed)`
        : commitLabel();
    writeFileSync(
      join(evidenceDir, "results", `${this.meta.id}.json`),
      `${JSON.stringify(
        {
          ...this.meta,
          environmentLabel: ENVIRONMENT_LABEL[this.meta.environment],
          verdict: this.passed ? "PASS" : "FAIL",
          commit,
          recordedAt: `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
          screenshots: this.shots,
          checks: this.checks,
          requests: this.log,
        },
        null,
        2,
      )}\n`,
    );
  }
}

// Fails when react-doctor reports any finding (warnings included) or scores apps/web below the minimum.
// Only diagnostics (no source code) are sent to the score API; telemetry stays off.
import { spawnSync } from "node:child_process";

const MIN_SCORE = 95;
const TARGET = "apps/web";
const isCi = process.env.CI === "true";

const run = (extraArgs) =>
  spawnSync("pnpm", ["exec", "react-doctor", TARGET, "-y", "--no-supply-chain", ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, REACT_DOCTOR_NO_TELEMETRY: "1" },
    shell: process.platform === "win32",
  });

const findings = run(["--no-score", "--blocking", "warning"]);
if (findings.status !== 0) {
  console.error(findings.stdout);
  console.error(findings.stderr);
  console.error(`react-doctor reported findings in ${TARGET}.`);
  process.exit(1);
}

const lastLine = run(["--score"]).stdout.trim().split("\n").at(-1) ?? "";
const score = Number(lastLine);

if (!Number.isFinite(score) || lastLine === "") {
  const message = "react-doctor could not compute a score (score API unreachable).";
  if (isCi) {
    console.error(`${message} Rerun the job.`);
    process.exit(1);
  }
  console.warn(`${message} Skipping the score check locally; CI enforces it.`);
  process.exit(0);
}

if (score < MIN_SCORE) {
  const details = run(["--no-score"]);
  console.error(details.stdout);
  console.error(`react-doctor score ${score} is below the minimum ${MIN_SCORE} for ${TARGET}.`);
  process.exit(1);
}

console.log(`react-doctor score ${score} (minimum ${MIN_SCORE}) for ${TARGET}.`);

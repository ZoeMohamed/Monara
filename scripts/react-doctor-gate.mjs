// Fails on any finding (warnings included) or a score below the minimum in either UI target.
// Only diagnostics (no source code) are sent to the score API; telemetry stays off.
import { spawnSync } from "node:child_process";

const MIN_SCORE = 95;
const TARGETS = ["apps/web", "packages/ui"];
const isCi = process.env.CI === "true";

const run = (target, extraArgs) =>
  spawnSync("pnpm", ["exec", "react-doctor", target, "-y", "--no-supply-chain", ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, REACT_DOCTOR_NO_TELEMETRY: "1" },
    shell: process.platform === "win32",
  });

for (const target of TARGETS) {
  const findings = run(target, ["--no-score", "--blocking", "warning"]);
  if (findings.status !== 0) {
    console.error(findings.stdout);
    console.error(findings.stderr);
    console.error(`react-doctor reported findings in ${target}.`);
    process.exit(1);
  }

  const lastLine = run(target, ["--score"]).stdout.trim().split("\n").at(-1) ?? "";
  const score = Number(lastLine);

  if (!Number.isFinite(score) || lastLine === "") {
    const message = "react-doctor could not compute a score (score API unreachable).";
    if (isCi) {
      console.error(`${message} Rerun the job.`);
      process.exit(1);
    }
    console.warn(`${message} Skipping the score check locally; CI enforces it.`);
    continue;
  }

  if (score < MIN_SCORE) {
    const details = run(target, ["--no-score"]);
    console.error(details.stdout);
    console.error(`react-doctor score ${score} is below the minimum ${MIN_SCORE} for ${target}.`);
    process.exit(1);
  }

  console.log(`react-doctor score ${score} (minimum ${MIN_SCORE}) for ${target}.`);
}

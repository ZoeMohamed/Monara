import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function generateDbTypes({ root, check = false, run = spawnSync }) {
  const result = run("pnpm", ["exec", "supabase", "gen", "types", "typescript", "--local"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw new Error(
      result.stderr?.trim() || result.error?.message || "Database type generation failed.",
    );
  }
  const target = join(root, "packages/db/src/types/database.types.ts");
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== result.stdout) {
      throw new Error(
        "Generated database types differ from packages/db/src/types/database.types.ts. Regenerate with pnpm db:types against the migrated local schema and review the diff.",
      );
    }
    return;
  }
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, result.stdout);
  renameSync(temporary, target);
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check") || args.length > 1) {
      throw new Error("Usage: pnpm db:types [--check]");
    }
    const check = args.includes("--check");
    generateDbTypes({ root: fileURLToPath(new URL("../", import.meta.url)), check });
    console.log(
      check
        ? "Generated database types match packages/db/src/types/database.types.ts."
        : "Generated packages/db/src/types/database.types.ts",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

import { spawnSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("pnpm", ["exec", "supabase", "gen", "types", "typescript", "--local"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
  shell: process.platform === "win32",
});

if (result.error || result.status !== 0 || !result.stdout?.trim()) {
  console.error(
    result.stderr?.trim() || result.error?.message || "Database type generation failed.",
  );
  process.exit(1);
}

const target = fileURLToPath(
  new URL("../packages/db/src/types/database.types.ts", import.meta.url),
);
const temporary = `${target}.tmp`;
writeFileSync(temporary, result.stdout);
renameSync(temporary, target);
console.log("Generated packages/db/src/types/database.types.ts");

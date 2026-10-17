import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Same-directory rename replaces the complete file on macOS, Linux and Windows.
// A failed write or rename leaves the original credential file untouched.
export function atomicWriteEnv(
  destination,
  content,
  { write = writeFileSync, replace = renameSync } = {},
) {
  const temporary = join(dirname(destination), `.env.monara-${randomUUID()}.tmp`);
  try {
    write(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    replace(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

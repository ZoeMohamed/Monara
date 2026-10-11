import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDb, validateMigrations } from "./check-db.mjs";
import { generateDbTypes } from "./generate-db-types.mjs";

function fixture(t, schema = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "monara-db-check-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, contents = "-- synthetic test fixture\n") => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  if (schema) {
    write("supabase/migrations/20261010064300_initial_schema.sql");
    write("supabase/tests/database/transactions_rls.test.sql");
    write("packages/db/src/types/database.types.ts", "export type Database = {};\n");
  }
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: args.includes("list") ? '{"stacks":[]}' : "", stderr: "" };
  };
  return { root, write, calls, run, log: () => {} };
}

describe("migration preflight", () => {
  it("accepts a real leap-day UTC timestamp and snake_case name", () => {
    validateMigrations(["20240229000159_initial_schema.sql"]);
  });

  it("rejects invalid names, impossible timestamps, and reused versions", () => {
    for (const name of ["initial.sql", "20261010064300_Bad-Name.sql"]) {
      assert.throws(() => validateMigrations([name]), /Invalid migration name/);
    }
    for (const version of ["20230229000100", "20261032000100", "20261010240100"]) {
      assert.throws(() => validateMigrations([`${version}_initial_schema.sql`]), /Invalid UTC/);
    }
    assert.throws(
      () => validateMigrations(["20261010064300_first.sql", "20261010064300_second.sql"]),
      /Duplicate migration timestamp/,
    );
  });

  it("skips the schema-less scaffold before any subprocess or Docker call", (t) => {
    const context = fixture(t, false);
    const messages = [];
    context.write("supabase/migrations/README.md");
    checkDb({ ...context, log: (message) => messages.push(message) });
    assert.equal(context.calls.length, 0);
    assert.match(messages[0], /skipped: no SQL migrations/);
  });

  it("fails before Docker when migrations are nested or their prerequisites are absent", (t) => {
    const context = fixture(t, false);
    context.write("supabase/migrations/nested/20261010064300_initial_schema.sql");
    assert.throws(() => checkDb(context), /directly under supabase\/migrations/);
    rmSync(join(context.root, "supabase/migrations/nested"), { recursive: true });
    context.write("supabase/migrations/20261010064300_initial_schema.sql");
    assert.throws(() => checkDb(context), /ownership\/RLS pgTAP tests/);
    context.write("supabase/tests/database/rls/schema.test.sql");
    assert.throws(() => checkDb(context), /ownership\/RLS pgTAP tests/);
    context.write("supabase/tests/database/transactions_rls.test.sql");
    assert.throws(() => checkDb(context), /require generated/);
    assert.equal(context.calls.length, 0);
  });

  it("requires an explicit reset before touching the local stack", (t) => {
    const context = fixture(t);
    assert.throws(() => checkDb(context), /db:check --reset/);
    assert.ok(context.calls.every(({ command }) => command === "git"));
  });

  it("refuses migrations or test suites reached through symbolic links", (t) => {
    const external = fixture(t);
    for (const path of ["supabase/migrations", "supabase/tests/database"]) {
      const context = fixture(t);
      const directory = join(context.root, path);
      rmSync(directory, { recursive: true });
      symlinkSync(
        join(external.root, path),
        directory,
        process.platform === "win32" ? "junction" : "dir",
      );
      assert.throws(() => checkDb(context), /without symbolic links/);
      assert.equal(context.calls.length, 0);
    }
  });

  it("rejects an untracked generated baseline in CI before Docker", (t) => {
    const context = fixture(t);
    const previous = process.env.CI;
    process.env.CI = "true";
    try {
      const run = (command, args, options) => ({
        ...context.run(command, args, options),
        status: 1,
      });
      assert.throws(
        () => checkDb({ ...context, run, reset: true }),
        /CI requires tracked generated/,
      );
      assert.equal(context.calls.length, 1);
      assert.equal(context.calls[0].command, "git");
    } finally {
      if (previous === undefined) delete process.env.CI;
      else process.env.CI = previous;
    }
  });
});

describe("local database gate", () => {
  it("uses local targets, lint warning failures, a nonmutating type check, and cleanup", (t) => {
    const context = fixture(t);
    checkDb({ ...context, reset: true });
    const commands = context.calls
      .filter(({ command }) => command === "pnpm")
      .map(({ args }) => args);
    assert.deepEqual(commands, [
      ["exec", "supabase", "stack", "list", "--output-format", "json"],
      ["db:start", "--runtime", "docker"],
      ["exec", "supabase", "db", "reset", "--local"],
      [
        "exec",
        "supabase",
        "db",
        "lint",
        "--local",
        "--schema",
        "public",
        "--level",
        "warning",
        "--fail-on",
        "warning",
      ],
      ["exec", "supabase", "test", "db", "--local"],
      ["db:types", "--check"],
      ["db:stop"],
    ]);
    assert.ok(context.calls.every(({ options }) => options.env.SUPABASE_WORKDIR === context.root));
    assert.ok(
      context.calls.every(({ options }) => options.env.SUPABASE_EXPERIMENTAL_STACK === "1"),
    );
  });

  it("refuses a running checkout stack without starting or stopping it", (t) => {
    const context = fixture(t);
    const run = (command, args, options) => {
      const result = context.run(command, args, options);
      if (args.includes("list")) {
        result.stdout = JSON.stringify({
          stacks: [{ project_root: context.root, owner: "reachable", runtime: "docker" }],
        });
      }
      return result;
    };
    assert.throws(() => checkDb({ ...context, run, reset: true }), /checkout is running/);
    assert.ok(
      context.calls.every(({ args }) => !args.includes("db:start") && !args.includes("db:stop")),
    );
  });

  it("recognizes running stacks reported through existing symlink or dot-segment aliases", (t) => {
    const context = fixture(t);
    const aliases = fixture(t, false);
    const link = join(aliases.root, "checkout-link");
    symlinkSync(context.root, link, process.platform === "win32" ? "junction" : "dir");
    for (const projectRoot of [link, `${context.root}${sep}.`]) {
      assert.notEqual(projectRoot, context.root);
      const run = (command, args, options) => {
        const result = context.run(command, args, options);
        if (args.includes("list")) {
          result.stdout = JSON.stringify({
            stacks: [{ project_root: projectRoot, owner: "reachable", runtime: "docker" }],
          });
        }
        return result;
      };
      assert.throws(() => checkDb({ ...context, run, reset: true }), /checkout is running/);
    }
    assert.ok(
      context.calls.every(
        ({ args }) =>
          !args.includes("db:start") && !args.includes("reset") && !args.includes("db:stop"),
      ),
    );
  });

  it("refuses an unverifiable registry path before starting, resetting, or stopping a stack", (t) => {
    const context = fixture(t);
    const run = (command, args, options) => {
      const result = context.run(command, args, options);
      if (args.includes("list")) {
        result.stdout = JSON.stringify({
          stacks: [
            {
              project_root: join(context.root, "missing-checkout"),
              owner: "unavailable",
              runtime: "docker",
            },
          ],
        });
      }
      return result;
    };
    assert.throws(() => checkDb({ ...context, run, reset: true }), /stack path; refusing to reset/);
    assert.ok(
      context.calls.every(
        ({ args }) =>
          !args.includes("db:start") && !args.includes("reset") && !args.includes("db:stop"),
      ),
    );
  });

  it("fails closed on malformed or partially unreadable registry output", (t) => {
    const context = fixture(t);
    for (const output of ["not json", '{"stacks":null}', '{"stacks":[null]}']) {
      const run = (command, args, options) => {
        const result = context.run(command, args, options);
        if (args.includes("list")) result.stdout = output;
        return result;
      };
      assert.throws(() => checkDb({ ...context, run, reset: true }), /refusing to reset/);
    }
    assert.ok(context.calls.every(({ args }) => !args.includes("db:start")));
  });

  it("stops a partially started stack and preserves the original failure", (t) => {
    const context = fixture(t);
    const run = (command, args, options) => {
      const result = context.run(command, args, options);
      if (args.includes("db:start")) result.status = 1;
      return result;
    };
    assert.throws(
      () => checkDb({ ...context, run, reset: true }),
      /db:start --runtime docker failed/,
    );
    assert.deepEqual(context.calls.at(-1).args, ["db:stop"]);
    assert.ok(context.calls.every(({ args }) => !args.includes("reset")));
  });

  it("stops the stack when tests or generated-type validation fail", (t) => {
    for (const failed of ["test", "db:types"]) {
      const context = fixture(t);
      const run = (command, args, options) => {
        const result = context.run(command, args, options);
        if (args.includes(failed)) result.status = 1;
        return result;
      };
      assert.throws(() => checkDb({ ...context, run, reset: true }), /failed/);
      assert.deepEqual(context.calls.at(-1).args, ["db:stop"]);
    }
  });

  it("reports the check failure and a failed cleanup together", (t) => {
    const context = fixture(t);
    const run = (command, args, options) => {
      const result = context.run(command, args, options);
      if (args.includes("test") || args.includes("db:stop")) result.status = 1;
      return result;
    };
    assert.throws(
      () => checkDb({ ...context, run, reset: true }),
      (error) => error instanceof AggregateError && error.errors.length === 2,
    );
  });
});

describe("generated types", () => {
  it("checks the working-tree baseline without overwriting edits on mismatch", (t) => {
    const context = fixture(t);
    const target = join(context.root, "packages/db/src/types/database.types.ts");
    const baseline = readFileSync(target, "utf8");
    const run = () => ({ status: 0, stdout: "export type Database = { changed: true };\n" });
    assert.throws(() => generateDbTypes({ root: context.root, check: true, run }), /types differ/);
    assert.equal(readFileSync(target, "utf8"), baseline);
    assert.equal(existsSync(`${target}.tmp`), false);
    generateDbTypes({
      root: context.root,
      check: true,
      run: () => ({ status: 0, stdout: baseline }),
    });
  });

  it("preserves generated files when schema reads fail or return empty output", (t) => {
    const context = fixture(t);
    const target = join(context.root, "packages/db/src/types/database.types.ts");
    const baseline = readFileSync(target, "utf8");
    for (const result of [{ status: 1 }, { status: 0, stdout: "\n" }]) {
      assert.throws(
        () => generateDbTypes({ root: context.root, run: () => result }),
        /generation failed/,
      );
    }
    assert.equal(readFileSync(target, "utf8"), baseline);
  });

  it("writes a successful schema read atomically when check mode is off", (t) => {
    const context = fixture(t);
    const target = join(context.root, "packages/db/src/types/database.types.ts");
    const stdout = "export type Database = { synthetic: true };\n";
    generateDbTypes({ root: context.root, run: () => ({ status: 0, stdout }) });
    assert.equal(readFileSync(target, "utf8"), stdout);
    assert.equal(existsSync(`${target}.tmp`), false);
  });
});

describe("database wrapper", () => {
  it("rejects unsupported runtime and target options before starting Supabase", () => {
    const script = fileURLToPath(new URL("./db.mjs", import.meta.url));
    for (const args of [
      ["start", "--runtime", "native"],
      ["start", "--stack", "other"],
      ["stop", "--runtime", "docker"],
    ]) {
      const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Usage:/);
      assert.equal(result.stdout, "");
    }
  });
});

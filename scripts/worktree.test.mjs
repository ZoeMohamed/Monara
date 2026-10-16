import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateSlot,
  parseEnv,
  portsForSlot,
  releaseSlot,
  seedEnvContent,
  setEnvValues,
} from "./lib/worktree.mjs";

const alwaysFree = () => Promise.resolve(true);
const alive = () => true;

describe("allocateSlot", () => {
  it("claims the lowest free slot for a new worktree", async () => {
    const result = await allocateSlot({
      claims: { "/a": 1, "/b": 3 },
      worktreePath: "/c",
      isLive: alive,
      isFree: alwaysFree,
    });
    assert.equal(result.slot, 2);
    assert.deepEqual(result.claims, { "/a": 1, "/b": 3, "/c": 2 });
  });

  it("reuses the existing claim for the same worktree", async () => {
    const result = await allocateSlot({
      claims: { "/a": 4 },
      worktreePath: "/a",
      isLive: alive,
      isFree: alwaysFree,
    });
    assert.equal(result.slot, 4);
  });

  it("drops claims whose directory no longer exists", async () => {
    const result = await allocateSlot({
      claims: { "/gone": 1 },
      worktreePath: "/new",
      isLive: (path) => path !== "/gone",
      isFree: alwaysFree,
    });
    assert.equal(result.slot, 1);
    assert.deepEqual(result.claims, { "/new": 1 });
  });

  it("skips slots whose ports are busy", async () => {
    const busy = new Set([portsForSlot(1).web]);
    const result = await allocateSlot({
      claims: {},
      worktreePath: "/a",
      isLive: alive,
      isFree: (port) => Promise.resolve(!busy.has(port)),
    });
    assert.equal(result.slot, 2);
  });

  it("fails when no slot is free", async () => {
    await assert.rejects(
      allocateSlot({
        claims: {},
        worktreePath: "/a",
        isLive: alive,
        isFree: () => Promise.resolve(false),
      }),
      /No free worktree slot/,
    );
  });
});

describe("env inheritance", () => {
  const template = "TOKEN=\nDB=\nNEW_KEY=\nURL=http://localhost:3000\n";

  it("inherits credentials, adds new template keys, and replaces checkout-specific values", () => {
    const result = parseEnv(
      seedEnvContent({
        template,
        source: "TOKEN=local-secret\nDB=other-checkout\nCUSTOM=keep\n",
        blankKeys: ["DB"],
        values: { URL: "http://localhost:3002" },
      }),
    );
    assert.deepEqual(result, {
      TOKEN: "local-secret",
      DB: "",
      NEW_KEY: "",
      URL: "http://localhost:3002",
      CUSTOM: "keep",
    });
  });

  it("preserves the existing database and credentials on repeated setup", () => {
    const existing = "TOKEN=worktree-secret\nDB=own-database\n";
    const options = {
      template,
      source: "TOKEN=main-secret\n",
      existing,
      blankKeys: ["DB"],
      values: { URL: "http://localhost:3002" },
    };
    const first = seedEnvContent(options);
    assert.equal(parseEnv(first).TOKEN, "worktree-secret");
    assert.equal(parseEnv(first).DB, "own-database");
    assert.equal(seedEnvContent({ ...options, existing: first }), first);
  });

  it("creates a usable template when no credential source exists", () => {
    assert.equal(parseEnv(seedEnvContent({ template, values: {} })).NEW_KEY, "");
  });

  it("keeps local comments and multiline values intact", () => {
    const source = '# custom settings\nTOKEN="first\nsecond"\n';
    const result = seedEnvContent({ template, source, values: {} });
    assert.ok(result.startsWith(source));
    assert.ok(result.includes("NEW_KEY=\n"));
  });
});

describe("releaseSlot", () => {
  it("removes only the given worktree", () => {
    assert.deepEqual(releaseSlot({ "/a": 1, "/b": 2 }, "/a"), { "/b": 2 });
  });
});

describe("setEnvValues", () => {
  it("replaces existing and empty template values", () => {
    const result = setEnvValues("A=old\nB=\nC=keep\n", { A: "new", B: "filled" });
    assert.equal(result, "A=new\nB=filled\nC=keep\n");
  });

  it("appends missing keys on their own line", () => {
    assert.equal(setEnvValues("A=1", { B: "2" }), "A=1\nB=2\n");
  });
});

describe("parseEnv", () => {
  it("reads KEY=value lines and ignores comments", () => {
    assert.deepEqual(parseEnv("# note\nWEB_PORT=3001\nAGENT_PORT=8788\n"), {
      WEB_PORT: "3001",
      AGENT_PORT: "8788",
    });
  });
});

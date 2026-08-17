import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataRoot, defineDataDir, getDataDirs } from "./data-dir";

// `defineDataDir`'s registry is module-global and never cleared — that is the
// point of its exactly-once discipline — so every test below uses a fixture name
// unique to itself. Two tests sharing a name would collide through the registry
// rather than through anything they assert.

const ORIGINAL_ROOT = process.env.SINGULARITY_DIR;

afterEach(() => {
  // Several tests rewrite the root mid-test to prove paths resolve lazily.
  if (ORIGINAL_ROOT === undefined) delete process.env.SINGULARITY_DIR;
  else process.env.SINGULARITY_DIR = ORIGINAL_ROOT;
});

afterAll(() => {
  if (ORIGINAL_ROOT === undefined) delete process.env.SINGULARITY_DIR;
  else process.env.SINGULARITY_DIR = ORIGINAL_ROOT;
});

const spec = (name: string) =>
  ({
    kind: "cache",
    name,
    owner: "infra/paths",
    description: "test fixture",
    reclaim: { kind: "safe" },
  }) as const;

test("a duplicate kind/name throws rather than returning the first", () => {
  defineDataDir(spec("dup-fixture"));
  expect(() => defineDataDir(spec("dup-fixture"))).toThrow(/already declared/);
});

test("the same name under a DIFFERENT kind is a different directory", () => {
  const cache = defineDataDir(spec("two-kinds"));
  const locks = defineDataDir({ ...spec("two-kinds"), kind: "locks" });
  expect(cache.path).not.toBe(locks.path);
});

test("an invalid name throws", () => {
  for (const bad of [
    "Caps",
    "-leading",
    "has/slash",
    "has space",
    "",
    "..",
    "under_score",
  ]) {
    expect(() => defineDataDir(spec(bad))).toThrow(/name must match/);
  }
});

test("path resolves lazily against the CURRENT SINGULARITY_DIR, not the one at declaration", () => {
  process.env.SINGULARITY_DIR = "/tmp/root-a";
  const dir = defineDataDir(spec("lazy-fixture"));
  expect(dir.path).toBe(join("/tmp/root-a", "cache", "lazy-fixture"));

  // The launcher's move: the root changes AFTER the declaration ran.
  process.env.SINGULARITY_DIR = "/tmp/root-b";
  expect(dir.path).toBe(join("/tmp/root-b", "cache", "lazy-fixture"));
  expect(dir.file("sub", "f.json")).toBe(
    join("/tmp/root-b", "cache", "lazy-fixture", "sub", "f.json"),
  );
  expect(dataRoot()).toBe("/tmp/root-b");
});

test("legacyLocation resolves relative to the root, outside its kind", () => {
  process.env.SINGULARITY_DIR = "/tmp/root-c";
  const dir = defineDataDir({
    ...spec("legacy-fixture"),
    kind: "services",
    legacyLocation: {
      path: "postgres",
      reason: "moving it needs cluster downtime",
    },
  });
  expect(dir.path).toBe(join("/tmp/root-c", "postgres"));
  // Still lazy — the override is a relative segment, never a frozen absolute.
  process.env.SINGULARITY_DIR = "/tmp/root-d";
  expect(dir.path).toBe(join("/tmp/root-d", "postgres"));
});

test("getDataDirs returns a copy, keyed by kind/name", () => {
  defineDataDir(spec("copy-fixture"));
  const first = getDataDirs();
  const second = getDataDirs();
  expect(first).not.toBe(second);
  expect(first.get("cache/copy-fixture")?.spec.name).toBe("copy-fixture");
});

test("ensure() creates the directory and returns it", () => {
  const root = mkdtempSync(join(tmpdir(), "data-dir-ensure-"));
  process.env.SINGULARITY_DIR = root;
  const dir = defineDataDir(spec("ensure-fixture"));
  expect(dir.ensure()).toBe(join(root, "cache", "ensure-fixture"));
  // Idempotent: a second call on an existing directory is a no-op, not a throw.
  expect(dir.ensure()).toBe(join(root, "cache", "ensure-fixture"));
});

test("ensure() throws when the target exists and is NOT a directory", () => {
  // The trap this guard exists for: several root entries are loose FILES today
  // (`duress.latch`, `gateway.pid`, the `*.jsonl` sinks). Pointing a
  // declaration's `legacyLocation` at one of those would otherwise try to mkdir
  // over the file, and the owner's next write would fail with EISDIR far from
  // the declaration that caused it.
  const root = mkdtempSync(join(tmpdir(), "data-dir-notdir-"));
  mkdirSync(join(root, "logs"), { recursive: true });
  writeFileSync(join(root, "some.latch"), "held");
  process.env.SINGULARITY_DIR = root;

  const dir = defineDataDir({
    ...spec("notdir-fixture"),
    kind: "logs",
    legacyLocation: { path: "some.latch", reason: "loose file at the root" },
  });

  expect(() => dir.ensure()).toThrow(/is NOT a directory/);
});

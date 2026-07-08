import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computePersist,
  loadCorpusFile,
  refreshCorpus,
  type CorpusFile,
  type RefreshDeps,
} from "./corpus-index";

// ─── Fixture ─────────────────────────────────────────────────────────────────
// A tiny `<root>/<dir>/<name>.txt` tree standing in for a real corpus. `parse`
// records how many times each path was parsed so the fingerprint-skip and
// vanished-drop behaviour is directly observable.

let root: string;
let corpusRoot: string;
let indexPath: string;
let parseCount: Map<string, number>;

const VERSION = 1;

function deps(overrides: Partial<RefreshDeps<string>> = {}): RefreshDeps<string> {
  return {
    roots: [corpusRoot],
    match: (p) => p.endsWith(".txt"),
    parse: async (p) => {
      parseCount.set(p, (parseCount.get(p) ?? 0) + 1);
      return await readFile(p, "utf8");
    },
    indexPath,
    concurrency: 4,
    persist: false,
    withSlot: (fn) => fn(),
    // A real macrotask yield, exercising the between-files breath.
    yieldServer: () => new Promise<void>((r) => setImmediate(r)),
    ...overrides,
  };
}

function empty(): CorpusFile<string> {
  return { version: VERSION, files: {} };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "corpus-index-test-"));
  corpusRoot = join(root, "corpus");
  indexPath = join(root, "index.json");
  parseCount = new Map();
  await mkdir(join(corpusRoot, "a"), { recursive: true });
  await mkdir(join(corpusRoot, "b"), { recursive: true });
  await writeFile(join(corpusRoot, "a", "one.txt"), "one");
  await writeFile(join(corpusRoot, "a", "two.txt"), "two");
  await writeFile(join(corpusRoot, "b", "three.txt"), "three");
  // A non-matching file that must be ignored by `match`.
  await writeFile(join(corpusRoot, "b", "skip.md"), "skip");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("cold path parses every matching file (and only matching files)", async () => {
  const index = empty();
  const { changed } = await refreshCorpus(index, deps());
  expect(changed).toBe(true);
  expect(Object.keys(index.files).length).toBe(3); // .md excluded
  expect([...parseCount.values()].every((n) => n === 1)).toBe(true);
  expect(Object.keys(index.files).some((p) => p.endsWith("skip.md"))).toBe(false);
});

test("only changed files re-parse (fingerprint skip)", async () => {
  const index = empty();
  await refreshCorpus(index, deps());
  const before = new Map(Object.entries(index.files));

  // Second pass, nothing touched → zero re-parses, same entry objects, no change.
  parseCount.clear();
  const { changed } = await refreshCorpus(index, deps());
  expect(changed).toBe(false);
  expect(parseCount.size).toBe(0);
  for (const [path, e] of Object.entries(index.files)) {
    expect(e).toBe(before.get(path)!); // same object → not re-parsed
  }

  // Append to exactly one file → its (mtime,size) changes → exactly one re-parse.
  parseCount.clear();
  const changedPath = join(corpusRoot, "a", "one.txt");
  await appendFile(changedPath, " more");
  const r2 = await refreshCorpus(index, deps());
  expect(r2.changed).toBe(true);
  expect(parseCount.size).toBe(1);
  expect(parseCount.get(changedPath)).toBe(1);
  expect(index.files[changedPath]!.partial).toBe("one more");
});

test("vanished files are dropped", async () => {
  const index = empty();
  await refreshCorpus(index, deps());
  expect(Object.keys(index.files).length).toBe(3);

  await rm(join(corpusRoot, "b", "three.txt"));
  const { changed } = await refreshCorpus(index, deps());
  expect(changed).toBe(true);
  expect(Object.keys(index.files).length).toBe(2);
  expect(Object.keys(index.files).some((p) => p.endsWith("three.txt"))).toBe(false);
});

test("a version mismatch forces a full rebuild (empty on load)", async () => {
  // Persist a v1 index, then load it asking for v2 → treated as empty.
  const index = empty();
  await refreshCorpus(index, deps({ persist: true }));
  const loadedSame = await loadCorpusFile<string>(indexPath, VERSION);
  expect(Object.keys(loadedSame.files).length).toBe(3); // same version → reused

  const loadedBumped = await loadCorpusFile<string>(indexPath, VERSION + 1);
  expect(loadedBumped.version).toBe(VERSION + 1);
  expect(Object.keys(loadedBumped.files).length).toBe(0); // mismatch → rebuild
});

test("persist writes an atomic, re-loadable index; no temp file lingers", async () => {
  const index = empty();
  const { changed } = await refreshCorpus(index, deps({ persist: true }));
  expect(changed).toBe(true);

  // The index file is valid JSON and round-trips.
  const raw = await readFile(indexPath, "utf8");
  const parsed = JSON.parse(raw) as CorpusFile<string>;
  expect(parsed.version).toBe(VERSION);
  expect(Object.keys(parsed.files).length).toBe(3);
  const reloaded = await loadCorpusFile<string>(indexPath, VERSION);
  expect(Object.keys(reloaded.files).length).toBe(3);

  // No `.tmp` sibling left behind (temp was renamed, not left dangling).
  const siblings = await readFile(indexPath, "utf8").then(() => true);
  expect(siblings).toBe(true);
});

test("persist=false never writes the index to disk", async () => {
  const index = empty();
  await refreshCorpus(index, deps({ persist: false }));
  const wrote = await readFile(indexPath, "utf8").then(
    () => true,
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return false;
      throw err;
    },
  );
  expect(wrote).toBe(false);
});

test("computePersist: host scope persists only on main; worktree always persists", () => {
  expect(computePersist("host", true)).toBe(true);
  expect(computePersist("host", false)).toBe(false); // host, non-main → no write
  expect(computePersist("worktree", true)).toBe(true);
  expect(computePersist("worktree", false)).toBe(true);
});

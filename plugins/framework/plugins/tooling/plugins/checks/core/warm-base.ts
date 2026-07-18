/**
 * Host-global warm-base pool for `.tsbuildinfo`.
 *
 * `.tsbuildinfo` is a BYPRODUCT of running the type-check, not a tracked
 * output — so the check-result cache (`./cache.ts`) starves it: when main's
 * auto-build hits that cache, `check.run()` never executes and main's local
 * buildinfo is never rewritten. Seeding fresh worktrees from main therefore
 * handed every new worktree an ever-staler base (measured: 368/7615 files to
 * revalidate on `web-core` against main, vs 0 against a 2h-old sibling).
 *
 * The fix is a recency-selected POOL, not a content-addressed store. Keying an
 * artifact on its exact input set only hits when inputs are IDENTICAL — which
 * is precisely when the check-result cache already skips the whole check. An
 * incremental checkpoint earns its value when inputs DIFFER: it is a warm
 * *base*, not an exact output. So every run in any worktree publishes, and
 * whoever starts next reads the newest.
 *
 * Relocating a buildinfo verbatim between worktrees is sound: TS 5.8 writes no
 * absolute paths (`fileNames` are relative to the buildinfo's own directory)
 * and validates by content hash, so a worktree's mtime reset is irrelevant.
 * The embedded `version`/`options` mean an incompatible base self-invalidates
 * into a full check — best-effort, never wrong.
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";
import { tsBuildInfoPath } from "./discover";

const POOL_DIR = join(SINGULARITY_DIR, "tsbuildinfo");

// Keep a few recent bases per (tsVersion, target) so a publish racing a read
// never leaves the pool empty, and age out the rest. ~21 MB steady state.
const KEEP_PER_TARGET = 3;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const require = createRequire(import.meta.url);

let cachedTsVersion: string | null = null;

/**
 * The resolved `typescript` version, read from its package.json rather than by
 * importing the module (module eval is ~1s and this runs on every check).
 *
 * This is a cheap directory PARTITION, not a correctness mechanism — tsc's own
 * embedded `version`/`options` self-validation is what guarantees correctness,
 * so an imperfect partition can only cost a cold run, never a wrong result.
 */
function tsVersion(): string {
  // Memoized: `poolDirFor` runs once per target per operation (8 targets ×
  // materialize+publish), and the resolved compiler cannot change mid-process.
  if (cachedTsVersion === null) {
    const pj = require.resolve("typescript/package.json");
    cachedTsVersion = (JSON.parse(readFileSync(pj, "utf8")) as { version: string }).version;
  }
  return cachedTsVersion;
}

function poolDirFor(targetName: string): string {
  return join(POOL_DIR, tsVersion(), targetName);
}

/** Pool entries newest-first. Ids are monotonic, so name order IS recency. */
function listEntries(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".tsbuildinfo"))
    .sort()
    .reverse();
}

/**
 * Seed this worktree's local buildinfo from the newest pooled base — but ONLY
 * when there is no local buildinfo yet. Call before spawning tsc.
 *
 * The pool serves COLD starts, which is exactly the gap that motivated it: a
 * fresh worktree used to be seeded from main's ever-staler cache. Recency is
 * deliberately NOT used to displace a base that already exists locally. A local
 * base is `main(older) + this worktree's own delta`; a pooled one is
 * `main(newer) + some sibling's delta`. Neither dominates — the sibling's entry
 * is newer by wall-clock, but it carries an unrelated branch's changes, so
 * preferring it would make a worktree iterating in place revalidate its own
 * delta AND the stranger's. "Newer" is not "better as a base", so overwriting a
 * present local base is a guess that can regress the steady state. This rule
 * cannot: with no local base it strictly beats the old main-seed, and with one
 * it leaves today's behaviour untouched.
 *
 * Possible future refinement, deliberately out of scope: right after a rebase
 * the local base IS stale w.r.t. the new tree, and a sibling that already
 * checked the rebased main could beat it. Deciding that needs a content-overlap
 * comparison between the candidate bases, not an mtime check.
 *
 * A no-op when the pool is empty — a cold run is the correct fallback.
 */
export function materializeWarmBase(root: string, targetName: string): void {
  const localPath = tsBuildInfoPath(root, targetName);
  if (existsSync(localPath)) return; // keep the worktree's own base untouched

  const dir = poolDirFor(targetName);
  const newest = listEntries(dir)[0];
  if (!newest) return;

  mkdirSync(dirname(localPath), { recursive: true });
  try {
    // COPY, never hardlink/symlink: tsc WRITES this file in place, so a link
    // would let one worker's incremental update corrupt the shared pool entry
    // that every other worktree is about to read. Load-bearing.
    copyFileSync(join(dir, newest), localPath);
  } catch (err) {
    // Same race the prune loops tolerate: a concurrent publisher's prune can
    // drop the entry between listing it and copying it. Losing a warm base
    // costs a colder run, never a wrong result — but any other error
    // (permissions, disk) is a real fault and must surface.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Publish this worktree's local buildinfo into the pool, then prune.
 *
 * A no-op when the local file is absent (nothing ran, or tsc never got far
 * enough to persist). Two publishers racing simply produce two entries; the
 * newest wins on the next read.
 */
export function publishWarmBase(root: string, targetName: string): void {
  const localPath = tsBuildInfoPath(root, targetName);
  if (!existsSync(localPath)) return;

  const dir = poolDirFor(targetName);
  mkdirSync(dir, { recursive: true });

  // Monotonic + sortable by name, so selection is "newest by name" with no
  // stat storm across entries. The pid disambiguates same-millisecond races.
  const publishId = `${Date.now()}-${process.pid}`;
  const tmp = join(dir, `.${publishId}.tmp`);
  copyFileSync(localPath, tmp);
  renameSync(tmp, join(dir, `${publishId}.tsbuildinfo`)); // atomic on the same filesystem

  prune(dir);
}

// Opportunistic pruning: age-out stale entries, then keep only the newest few.
// Tolerates the readdir/stat race (a concurrent publisher's prune may remove an
// entry between listing and stat). Also sweeps abandoned `.tmp` files, which a
// killed publisher leaves behind and which the `.tsbuildinfo` filter hides.
function prune(dir: string): void {
  const now = Date.now();
  const keep = new Set(listEntries(dir).slice(0, KEEP_PER_TARGET));
  for (const name of readdirSync(dir)) {
    if (keep.has(name)) continue;
    const path = join(dir, name);
    if (name.endsWith(".tmp")) {
      rmSync(path, { force: true });
      continue;
    }
    // Anything past the newest KEEP_PER_TARGET is superseded — a hard cap, so
    // the pool is bounded by construction rather than by how often it is swept.
    rmSync(path, { force: true });
  }
  // The count cap alone never empties a target that stopped being built, so age
  // out the survivors too — a base this old is not worth its disk.
  for (const name of keep) {
    const path = join(dir, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue; // entry vanished underneath us — nothing to prune
    }
    if (now - mtimeMs > MAX_AGE_MS) rmSync(path, { force: true });
  }
}

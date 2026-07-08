import { readdir, readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { createFileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { yieldServer } from "./yield-server";

// ─── What this is ─────────────────────────────────────────────────────────────
//
// A fingerprint-keyed incremental file index — the generalization of the
// `stats/cost` usage-index template. A corpus is a set of files under some
// roots matching a predicate; each file is parsed exactly once (keyed on its
// `(mtimeMs, size)` fingerprint) and its per-file `TPartial` cached on disk.
// Only changed/new files are re-parsed; vanished files are dropped. The parse
// pipeline is bounded (concurrency + host-wide heavy-read slot + a macrotask
// yield between files) so a cold rebuild never freezes the serving loop.
//
// The ROLLUP of the per-file partials into whatever the consumer serves stays
// in the consumer (this primitive owns only the incremental index mechanics).

/** Caller-facing declaration of a corpus index. */
export interface CorpusIndexSpec<TPartial> {
  /** Stable id → warmup name / profiler span (only used by {@link CorpusIndex.warmup}). */
  name: string;
  /** Roots to enumerate. A function so callers can defer path resolution. */
  roots: string[] | (() => string[]);
  /** Predicate on a full path deciding whether a file belongs to the corpus. */
  match: (path: string) => boolean;
  /** Per-file parse. Side-effect-free — token/data only, never persists. */
  parse: (path: string) => Promise<TPartial>;
  /** On-disk index file path (host-global dir or a per-worktree data dir). */
  indexPath: string;
  /**
   * `host` ⇒ a single shared index; only main PERSISTS it (`isMain()` gate) so
   * worktree backends read it and compute any delta in-memory without racing on
   * the write. `worktree` ⇒ each backend owns its index and always persists.
   */
  scope: "host" | "worktree";
  /** Bump when `TPartial`'s shape changes ⇒ a version mismatch forces a full rebuild. */
  version: number;
  /** Bounded parse/stat concurrency (defaults to {@link DEFAULT_CONCURRENCY}). */
  concurrency?: number;
}

export interface CorpusIndex<TPartial> {
  /**
   * Lazy `(mtimeMs,size)` stat-diff refresh — THE correctness fallback. Call on
   * every read: it makes warmup deferral safe (a cold first request just pays
   * the incremental stat-diff, re-parsing only what changed). Single-flighted.
   */
  ensureFresh(): Promise<void>;
  /** The current per-file partials, keyed by path. The rollup stays in the consumer. */
  entries(): Map<string, TPartial>;
  /**
   * Main-only push freshness via `@parcel/watcher`: a corpus change marks the
   * index dirty and warms it in the background. No-op off main / if already started.
   */
  startWatcher(): Promise<void>;
  /**
   * Convenience: a `defineWarmup({ scope, run: startWatcher + ensureFresh })`
   * Registration. Consumers with EXTRA warm work (e.g. pricing) should instead
   * write their own `defineWarmup` that calls `ensureFresh`/`startWatcher`.
   */
  warmup(): Registration;
}

/** Persisted, per-file fingerprint + parsed partial. */
interface CorpusEntry<TPartial> {
  mtimeMs: number;
  size: number;
  partial: TPartial;
}

/** On-disk index document. */
export interface CorpusFile<TPartial> {
  version: number;
  files: Record<string, CorpusEntry<TPartial>>;
}

// Bounded parse concurrency: caps resident memory to ~K files' text at once
// (killing the unbounded-Promise.all spike) while still admitting each read
// through the host-wide heavy-read gate.
const DEFAULT_CONCURRENCY = 6;

// ─── persist mapping (host ⇒ main-only) ───────────────────────────────────────

/**
 * The single-writer invariant: a `host` index is persisted only by main; a
 * `worktree` index is always persisted by its own backend. Exported for tests.
 */
export function computePersist(scope: "host" | "worktree", mainBackend: boolean): boolean {
  return scope === "host" ? mainBackend : true;
}

// ─── load / save (atomic) ──────────────────────────────────────────────────────

export async function loadCorpusFile<TPartial>(
  indexPath: string,
  version: number,
): Promise<CorpusFile<TPartial>> {
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { version, files: {} };
  }
  let parsed: CorpusFile<TPartial>;
  try {
    parsed = JSON.parse(raw) as CorpusFile<TPartial>;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { version, files: {} };
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard on untrusted on-disk JSON
  if (!parsed || parsed.version !== version || typeof parsed.files !== "object") {
    // Version mismatch (or a corrupt/partial file) ⇒ start empty and rebuild.
    return { version, files: {} };
  }
  return parsed;
}

async function saveCorpusFile<TPartial>(
  indexPath: string,
  index: CorpusFile<TPartial>,
): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true });
  // Atomic write: a partially-written index would fail the version/shape guard
  // and force a full rebuild, so write to a sibling temp file then rename.
  const tmp = `${indexPath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(index), "utf8");
  await rename(tmp, indexPath);
}

// ─── enumerate ──────────────────────────────────────────────────────────────────

/**
 * Collect every file under `roots` for which `match` is true, recursing into
 * subdirectories. ENOENT at any level is tolerated (a root or dir that vanished
 * mid-walk contributes nothing). Symlinks are not followed (only `isDirectory()`
 * entries are recursed) so the walk cannot loop.
 */
async function enumerate(roots: string[], match: (path: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return;
    }
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        await walk(full);
      } else if (match(full)) {
        out.push(full);
      }
    }
  };
  for (const root of roots) {
    await walk(root);
  }
  return out;
}

// ─── refresh (incremental) ──────────────────────────────────────────────────────

/** Injectable dependencies for {@link refreshCorpus} — the testability seam. */
export interface RefreshDeps<TPartial> {
  roots: string[];
  match: (path: string) => boolean;
  parse: (path: string) => Promise<TPartial>;
  indexPath: string;
  concurrency: number;
  /** Whether to persist the index after a change (see {@link computePersist}). */
  persist: boolean;
  withSlot: <R>(fn: () => Promise<R>) => Promise<R>;
  yieldServer: () => Promise<void>;
}

/**
 * Incremental refresh: enumerate the corpus, `stat` every file, re-parse only
 * those whose `(mtimeMs,size)` fingerprint changed (or are new), drop entries
 * for files that vanished. Mutates `index` in place; persists (once) if a change
 * occurred and `deps.persist` is set.
 */
export async function refreshCorpus<TPartial>(
  index: CorpusFile<TPartial>,
  deps: RefreshDeps<TPartial>,
): Promise<{ changed: boolean }> {
  const paths = await enumerate(deps.roots, deps.match);
  const live = new Set(paths);
  let changed = false;

  // Drop entries for files that no longer exist.
  for (const path of Object.keys(index.files)) {
    if (!live.has(path)) {
      delete index.files[path];
      changed = true;
    }
  }

  // Stat all files; collect the ones whose fingerprint changed (or are new).
  const toParse: Array<{ path: string; mtimeMs: number; size: number }> = [];
  const statGate = createSemaphore(deps.concurrency);
  await Promise.all(
    paths.map((path) =>
      statGate.run(async () => {
        let st;
        try {
          st = await stat(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          return;
        }
        const cached = index.files[path];
        if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
          return; // unchanged file — skip
        }
        toParse.push({ path, mtimeMs: st.mtimeMs, size: st.size });
      }),
    ),
  );

  // Parse changed/new files through the bounded, heavy-read-gated pipeline.
  const parseGate = createSemaphore(deps.concurrency);
  await Promise.all(
    toParse.map((item) =>
      parseGate.run(async () => {
        const partial = await deps.withSlot(() => deps.parse(item.path));
        index.files[item.path] = { mtimeMs: item.mtimeMs, size: item.size, partial };
        changed = true;
        // A macrotask breath so request serving interleaves between files.
        await deps.yieldServer();
      }),
    ),
  );

  if (changed && deps.persist) {
    await saveCorpusFile(deps.indexPath, index);
  }
  return { changed };
}

// ─── index instance ────────────────────────────────────────────────────────────

/** Ambient host wiring the index instance depends on (injectable for tests). */
export interface CorpusIndexEnv {
  isMain: () => boolean;
  withSlot: <R>(fn: () => Promise<R>) => Promise<R>;
  yieldServer: () => Promise<void>;
  startFileWatcher: (opts: { dirs: string[]; onChange: () => void }) => Promise<void>;
}

/**
 * Build a {@link CorpusIndex} against injected env — the seam `defineCorpusIndex`
 * wraps with the real host wiring and tests drive with stubs.
 */
export function createCorpusIndex<TPartial>(
  spec: CorpusIndexSpec<TPartial>,
  env: CorpusIndexEnv,
): CorpusIndex<TPartial> {
  // The in-memory index, loaded from disk once per process then kept fresh by
  // incremental refresh. A watcher marks it dirty on corpus changes (push-based,
  // no TTL poll); every ensureFresh also does an on-demand stat-diff as the
  // correctness fallback.
  let index: CorpusFile<TPartial> | null = null;
  let dirty = true;
  let refreshInflight: Promise<void> | null = null;
  let watcherStarted = false;
  const concurrency = spec.concurrency ?? DEFAULT_CONCURRENCY;

  const resolveRoots = (): string[] =>
    typeof spec.roots === "function" ? spec.roots() : spec.roots;

  const refreshDeps = (): RefreshDeps<TPartial> => ({
    roots: resolveRoots(),
    match: spec.match,
    parse: spec.parse,
    indexPath: spec.indexPath,
    concurrency,
    persist: computePersist(spec.scope, env.isMain()),
    withSlot: env.withSlot,
    yieldServer: env.yieldServer,
  });

  async function ensureFresh(): Promise<void> {
    index ??= await loadCorpusFile<TPartial>(spec.indexPath, spec.version);
    // Main clears `dirty` after a refresh and relies on the watcher to set it
    // again. Worktree backends have no watcher, so they always re-check.
    if (!dirty && env.isMain()) return;
    refreshInflight ??= (async () => {
      try {
        await refreshCorpus(index!, refreshDeps());
        dirty = false;
      } finally {
        refreshInflight = null;
      }
    })();
    await refreshInflight;
  }

  function entries(): Map<string, TPartial> {
    const out = new Map<string, TPartial>();
    if (index) {
      for (const [path, e] of Object.entries(index.files)) {
        out.set(path, e.partial);
      }
    }
    return out;
  }

  async function startWatcher(): Promise<void> {
    if (watcherStarted || !env.isMain()) return;
    watcherStarted = true;
    await env.startFileWatcher({
      dirs: resolveRoots(),
      onChange: () => {
        // A corpus change: mark the index stale and warm it in the background so
        // the next request finds nothing (or little) to do.
        dirty = true;
        void ensureFresh();
      },
    });
  }

  function warmup(): Registration {
    return defineWarmup({
      name: spec.name,
      scope: spec.scope,
      run: async () => {
        await startWatcher();
        await ensureFresh();
      },
    });
  }

  return { ensureFresh, entries, startWatcher, warmup };
}

/**
 * Declare a fingerprint-keyed incremental file index over a file corpus. Wraps
 * {@link createCorpusIndex} with the real host wiring (`isMain`, the host-wide
 * heavy-read slot, a macrotask yield, and the `@parcel/watcher` primitive).
 */
export function defineCorpusIndex<TPartial>(
  spec: CorpusIndexSpec<TPartial>,
): CorpusIndex<TPartial> {
  return createCorpusIndex(spec, {
    isMain,
    withSlot: withHeavyReadSlot,
    yieldServer,
    startFileWatcher: async ({ dirs, onChange }) => {
      // Process-lifetime watcher — the handle is intentionally discarded (the
      // original stats/cost watcher was likewise fire-and-forget, main-only).
      await createFileWatcher({ dirs, onChange: () => onChange() });
    },
  });
}

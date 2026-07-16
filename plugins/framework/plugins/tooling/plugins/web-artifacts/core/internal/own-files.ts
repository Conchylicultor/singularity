// Own-file enumeration + the stat-fingerprint fast path. A plugin's artifact
// hash covers exactly its OWN reachable source set:
//   web artifact  → `web/`, `shared/`, `core/` subtrees + `package.json`
//   core artifact → `core/` subtree + `package.json`
//   entry artifact → web-core's `web/` (minus `public/`, tests)
// Nested sub-plugins live under `<dir>/plugins/` — outside these roots — so a
// child's change never touches the parent's hash.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { computeOwnHash } from "../hash";
import type { FingerprintCache, FingerprintRecord } from "./store";

/**
 * `web` (web+shared+core roots), `entry` (web-core's web dir), or any other
 * single folder-barrel kind (`core`, `fixtures`, …) whose root is the folder
 * itself. Open-ended on purpose: the artifact closure builds whatever folder
 * barrels the EMITTED code statically imports.
 */
export type ArtifactKind = string;

const SKIP_DIRS = new Set(["node_modules", "__tests__", "public"]);
const TEST_FILE_RE = /\.test\.[jt]sx?$/;

function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name === "dist" || e.name.startsWith("dist.")) continue;
      walkFiles(p, out);
    } else if (e.isFile()) {
      if (TEST_FILE_RE.test(e.name) || e.name === ".DS_Store") continue;
      out.push(p);
    }
  }
}

/** Absolute paths of the artifact's own files, sorted. */
export function listOwnFiles(pluginDir: string, kind: ArtifactKind): string[] {
  const roots =
    kind === "web"
      ? [join(pluginDir, "web"), join(pluginDir, "shared"), join(pluginDir, "core")]
      : kind === "entry"
        ? [pluginDir] // entry: web-core/web dir itself
        : [join(pluginDir, kind)]; // folder barrel: core, fixtures, …
  const out: string[] = [];
  for (const root of roots) walkFiles(root, out);
  if (kind !== "entry") {
    const pkg = join(pluginDir, "package.json");
    try {
      statSync(pkg);
      out.push(pkg);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  out.sort();
  return out;
}

/**
 * Aggregate content hash of an explicit file list, via the fingerprint fast
 * path: when the (mtimeMs, size) of every file matches the cached record, the
 * recorded hash is reused without reading content. Any mismatch (or a changed
 * file SET) re-reads and re-hashes, then updates the record in place. A file
 * that vanishes between listing and stat/read contributes nothing (transient —
 * e.g. a tracked-but-deleted path); any other IO error surfaces.
 */
export function cachedAggregateHash(opts: {
  cacheKey: string;
  /** Hash keys are paths relative to this dir, so renames invalidate. */
  baseDir: string;
  files: string[];
  cache: FingerprintCache;
}): string {
  const stats: Array<{ abs: string; rel: string; mtimeMs: number; size: number }> = [];
  for (const f of opts.files) {
    let st;
    try {
      st = statSync(f);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue;
    }
    if (!st.isFile()) continue;
    stats.push({ abs: f, rel: relative(opts.baseDir, f), mtimeMs: st.mtimeMs, size: st.size });
  }

  const record = opts.cache.records[opts.cacheKey];
  if (record && Object.keys(record.files).length === stats.length) {
    let clean = true;
    for (const s of stats) {
      const fp = record.files[s.rel];
      if (!fp || fp[0] !== s.mtimeMs || fp[1] !== s.size) {
        clean = false;
        break;
      }
    }
    if (clean) return record.ownHash;
  }

  const contents: Array<{ rel: string; content: Buffer }> = [];
  for (const s of stats) {
    try {
      contents.push({ rel: s.rel, content: readFileSync(s.abs) });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  const ownHash = computeOwnHash(contents);
  const next: FingerprintRecord = { files: {}, ownHash };
  for (const s of stats) next.files[s.rel] = [s.mtimeMs, s.size];
  opts.cache.records[opts.cacheKey] = next;
  return ownHash;
}

/**
 * The plugin's own-content hash — `cachedAggregateHash` over the artifact
 * kind's own-file roots.
 */
export function ownHashFor(opts: {
  cacheKey: string;
  pluginDir: string;
  kind: ArtifactKind;
  cache: FingerprintCache;
}): string {
  return cachedAggregateHash({
    cacheKey: opts.cacheKey,
    baseDir: opts.pluginDir,
    files: listOwnFiles(opts.pluginDir, opts.kind),
    cache: opts.cache,
  });
}

// Content-addressed artifact store at `~/.singularity/web-artifacts/`, shared
// across worktrees: a dir per artifact keyed by its inputs hash. Reuse bumps the
// dir's mtime so live artifacts never age out; pruning follows the
// `checks/core/cache.ts` shape (age + count bounds).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

export const WEB_ARTIFACTS_DIR = join(SINGULARITY_DIR, "web-artifacts");
export const WEB_ARTIFACTS_STORE_DIR = join(WEB_ARTIFACTS_DIR, "store");
const STORE_DIR = WEB_ARTIFACTS_STORE_DIR;
const FINGERPRINTS_DIR = join(WEB_ARTIFACTS_DIR, "fingerprints");

// Pruning bounds. An artifact dir is small (one module + map); the fleet is
// ~700 per builder identity, so these allow a handful of live identities.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 8000;
const TRIM_TO = 6000;

/** Per-artifact metadata persisted next to `index.js`. */
export interface ArtifactMeta {
  /** The import-map specifier this artifact serves (null for entry/registry). */
  specifier: string | null;
  kind: string;
  pluginPath: string | null;
  inputsHash: string;
  /** External specifiers the EMITTED module statically imports. */
  staticImports: string[];
  /** External specifiers the emitted module dynamically imports (registry). */
  dynamicImports: string[];
  builtAtMs: number;
}

export function artifactDirName(slug: string, kind: string, inputsHash: string): string {
  return `${slug}.${kind}.${inputsHash.slice(0, 16)}`;
}

export function artifactStorePath(dirName: string): string {
  return join(STORE_DIR, dirName);
}

export function ensureStoreDirs(): void {
  mkdirSync(STORE_DIR, { recursive: true });
  mkdirSync(FINGERPRINTS_DIR, { recursive: true });
}

/** True iff the artifact completed publishing (meta.json is written last). */
export function hasArtifact(dirName: string): boolean {
  return existsSync(join(artifactStorePath(dirName), "meta.json"));
}

export function readArtifactMeta(dirName: string): ArtifactMeta {
  return JSON.parse(
    readFileSync(join(artifactStorePath(dirName), "meta.json"), "utf8"),
  ) as ArtifactMeta;
}

/** Bump the artifact dir's mtime so pruning treats reused artifacts as live. */
export function touchArtifact(dirName: string): void {
  const now = new Date();
  try {
    utimesSync(artifactStorePath(dirName), now, now);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Atomically publish a freshly-built artifact dir: `meta.json` is written into
 * the temp dir first, then the whole dir is renamed into place. A concurrent
 * build of the identical artifact (another worktree) may win the rename race —
 * that's a success (identical content), so EEXIST/ENOTEMPTY discard the loser.
 */
export function publishArtifact(dirName: string, tmpDir: string, meta: ArtifactMeta): void {
  writeFileSync(join(tmpDir, "meta.json"), JSON.stringify(meta, null, 2));
  const dest = artifactStorePath(dirName);
  try {
    renameSync(tmpDir, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY" && code !== "EPERM") throw err;
    if (!hasArtifact(dirName)) throw err; // dest exists but is not a complete artifact
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** A staging area for one artifact build, inside the store (same filesystem). */
export function artifactTmpDir(dirName: string): string {
  const tmp = join(STORE_DIR, `.tmp.${dirName}.${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  return tmp;
}

/** Opportunistic prune: age-out stale artifact dirs, then cap total count. */
export function pruneStore(): void {
  ensureStoreDirs();
  let names: string[];
  try {
    names = readdirSync(STORE_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return;
  }
  const now = Date.now();
  const live: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    const path = join(STORE_DIR, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue; // vanished underneath us — nothing to prune
    }
    // Leftover temp dirs from crashed builds age out like artifacts.
    if (now - mtimeMs > MAX_AGE_MS || (name.startsWith(".tmp.") && now - mtimeMs > 60 * 60 * 1000)) {
      rmSync(path, { recursive: true, force: true });
    } else if (!name.startsWith(".tmp.")) {
      live.push({ path, mtimeMs });
    }
  }
  if (live.length > MAX_ENTRIES) {
    live.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
    for (const { path } of live.slice(0, live.length - TRIM_TO)) {
      rmSync(path, { recursive: true, force: true });
    }
  }
}

// ── Per-worktree fingerprint cache ──────────────────────────────────
//
// The stat-fingerprint fast path (à la `infra/corpus-index`): a worktree-scoped
// JSON mapping `<pluginPath>|<kind>` → { files: { rel: [mtimeMs, size] },
// ownHash }. When every stat matches, the recorded ownHash is reused without
// reading a byte of content.

export interface FingerprintRecord {
  files: Record<string, [number, number]>;
  ownHash: string;
}

export interface FingerprintCache {
  version: number;
  records: Record<string, FingerprintRecord>;
}

const FINGERPRINT_CACHE_VERSION = 1;

export function loadFingerprintCache(worktreeName: string): FingerprintCache {
  const file = join(FINGERPRINTS_DIR, `${worktreeName}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { version: FINGERPRINT_CACHE_VERSION, records: {} };
  }
  let parsed: FingerprintCache;
  try {
    parsed = JSON.parse(raw) as FingerprintCache;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { version: FINGERPRINT_CACHE_VERSION, records: {} };
  }
  if (parsed.version !== FINGERPRINT_CACHE_VERSION || typeof parsed.records !== "object") {
    return { version: FINGERPRINT_CACHE_VERSION, records: {} };
  }
  return parsed;
}

export function saveFingerprintCache(worktreeName: string, cache: FingerprintCache): void {
  ensureStoreDirs();
  const file = join(FINGERPRINTS_DIR, `${worktreeName}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, file);
}

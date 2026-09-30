import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { flockTry } from "@plugins/packages/plugins/flock/core";
import {
  ANALYSIS_VERSION,
  settingsKey,
  type AnalysisSettings,
} from "../../core";
import { beatFeaturesCacheDir } from "../../data-dirs";

/** One video's files under the cache, at one analysis version and settings. */
export interface FeaturePaths {
  /** The version and settings' dir, `<cache>/v<N>/<settingsKey>`. */
  dir: string;
  /** The features — present means ready. */
  ready: string;
  /** `{since, phase, pid}` while an analysis holds `lock`. */
  running: string;
  /** `{message, at, permanent}` after an analysis threw. */
  failed: string;
  /** The host flock one analysis of this video holds. */
  lock: string;
}

/** The cache root: the declared data dir, or a test's temp dir. */
export function cacheRoot(dir?: string): string {
  return dir ?? beatFeaturesCacheDir.path;
}

export function featurePaths(
  root: string,
  videoId: string,
  settings: AnalysisSettings,
  version: number = ANALYSIS_VERSION,
): FeaturePaths {
  const dir = join(root, `v${version}`, settingsKey(settings));
  return {
    dir,
    ready: join(dir, `${videoId}.json`),
    running: join(dir, `${videoId}.running.json`),
    failed: join(dir, `${videoId}.failed.json`),
    lock: join(dir, `${videoId}.lock`),
  };
}

// The per-video host flock: a kernel lock, released when its holder closes the
// fd OR dies, so a killed analysis leaves no lock behind — only a stale
// `running.json`, which reads as absent because nobody holds this.

/** Take the lock without waiting: the held fd, or `null` when another holds it. */
export function tryLock(path: string): number | null {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  if (flockTry(fd)) return fd;
  closeSync(fd);
  return null;
}

export function releaseLock(fd: number): void {
  closeSync(fd);
}

const LOCK_RETRY_MS = 500;

/**
 * Take the lock, waiting for its holder. Only ever called out of process
 * (`ensureBeatFeatures` demands an `ExecContext`): `flockTry` is non-blocking
 * by design, so the wait re-tries it, as `deps`' install lock does — the
 * holder is running a minute-long analysis, and there is no change signal
 * short of the blocking call itself.
 */
export async function waitLock(
  path: string,
  onWait: () => void,
): Promise<number> {
  const first = tryLock(path);
  if (first !== null) return first;
  onWait();
  for (;;) {
    await Bun.sleep(LOCK_RETRY_MS);
    const fd = tryLock(path);
    if (fd !== null) return fd;
  }
}

/** Whether some process holds the lock now: take it for an instant, release. */
export function isLockHeld(path: string): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, "a");
  try {
    return !flockTry(fd);
  } finally {
    closeSync(fd);
  }
}

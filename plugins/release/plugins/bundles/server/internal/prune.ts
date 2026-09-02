import { existsSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { compositionReleaseDir } from "./out-dir";
import { isPointerName } from "./pointer";

/**
 * What a sweep did. A batch outcome, so a partial reclaim is still reportable —
 * `removed` and `kept` together account for every run dir that was there.
 */
export interface PruneResult {
  removed: string[];
  kept: string[];
}

/**
 * A run id's embedded epoch-ms (`release-<ms>-<rand>`), or `-1` for a dir that
 * does not follow the shape. Sorting on the parsed number rather than on the
 * string keeps chronology right regardless of digit count.
 */
function runIdMs(runId: string): number {
  const ms = Number(runId.split("-")[1]);
  return Number.isFinite(ms) ? ms : -1;
}

/**
 * Keep the `keep` newest run dirs of `<composition>-<target>` and delete the
 * rest, never touching a run some `latest-<platform>` pointer names.
 *
 * `~/.singularity/state/releases/` had no retention policy at all, and a run dir
 * is a whole staged app — hundreds of megabytes. This is the only thing that
 * bounds it: a release's own supervised-run transcript is capped separately, by
 * the shared per-kind run prune, and reaping a transcript reclaims kilobytes.
 * Invoked by the release CLI right after the pointer write, so the pinned set is
 * already current.
 *
 * **Known bound, stated rather than papered over:** the pinned set is the
 * pointer set only. A *live Studio preview* running out of an older run dir is
 * not visible from here — previews live in the release engine's in-process map,
 * and this module is deliberately DB- and engine-free so a CLI process can
 * import it. With `keep = 3` a preview would have to be running against the 4th
 * newest run of the same composition to be hit.
 */
export function pruneReleaseRunDirs(
  namespace: string,
  composition: string,
  target: string,
  keep = 3,
): PruneResult {
  const compDir = compositionReleaseDir(namespace, composition, target);
  if (!existsSync(compDir)) return { removed: [], kept: [] };

  const entries = readdirSync(compDir);
  const pinned = new Set<string>();
  for (const name of entries.filter(isPointerName)) {
    try {
      pinned.add(basename(realpathSync(join(compDir, name))));
    } catch (err) {
      // A dangling pointer pins nothing — the run it named is already gone.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  const runs = entries
    .filter((e) => !isPointerName(e))
    .sort((a, b) => runIdMs(b) - runIdMs(a) || b.localeCompare(a));

  const removed: string[] = [];
  const kept: string[] = [];
  for (const [i, runId] of runs.entries()) {
    if (i < keep || pinned.has(runId)) {
      kept.push(runId);
      continue;
    }
    rmSync(join(compDir, runId), { recursive: true, force: true });
    removed.push(runId);
  }
  return { removed, kept };
}

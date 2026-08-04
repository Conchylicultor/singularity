import { join } from "node:path";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { compositionReleaseDir } from "./out-dir";

/**
 * The ONE directory ship looks in for a composition's bundles, resolved once.
 *
 * **Which namespace it keys on, and why.** `releaseOutDir` roots every release
 * at `<SINGULARITY_DIR>/releases/<namespace>/<comp>-<target>/`, where the
 * namespace is `currentWorktreeName()` — i.e. `SINGULARITY_WORKTREE`, falling
 * back to `main`. Ship keys on exactly the same call, which is what makes the
 * two agree in each of the two real situations:
 *
 * - **hand-run release + hand-run ship** — neither process has
 *   `SINGULARITY_WORKTREE`, so both see `releases/singularity/`, even when the
 *   CLI is invoked from a worktree checkout. (Confirmed against a real
 *   cross-build: `release --platform linux-x64` from this worktree wrote
 *   `releases/singularity/website-web/<run-id>/`, NOT `releases/att-…/`.)
 * - **Studio-triggered release + UI-triggered ship** — both run inside the
 *   worktree backend, so both see `releases/<that worktree>/`.
 *
 * The mismatch is the CROSS pair (a Studio release, then a hand-run ship), and
 * it is deliberately left as a loud miss: this function is never called for more
 * than one namespace, and every refusal carries the absolute path it looked in.
 * Searching both namespaces would make "which bundle am I shipping?"
 * ambiguous, which is strictly worse than a miss you can read in one line.
 */
export function bundleRoot(composition: string): { namespace: string; compDir: string } {
  const namespace = currentWorktreeName();
  return { namespace, compDir: compositionReleaseDir(namespace, composition, "web") };
}

/**
 * The stable pointer a PACKED run claims: `latest-<platform>`, one per platform.
 *
 * Keyed by platform, not just by `<comp>-<target>`, because a host `--dev` run
 * and a `linux-x64` candidate of the same composition used to overwrite each
 * other's bare `latest` — after which `ship` resolved the wrong run and refused
 * on platform mismatch. With the platform in the NAME the clobber is
 * structurally impossible rather than a refusal.
 *
 * This function and `claimLatestPointer`'s caller in the release CLI are the
 * only two places the name is spelled; they change together.
 */
export function latestPointerName(platform: string): string {
  return `latest-${platform}`;
}

/** Whether `entry` is one of the pointer symlinks rather than a run dir. */
export function isPointerName(entry: string): boolean {
  return entry === "latest" || entry.startsWith("latest-");
}

/** Absolute path of the `latest-<platform>` pointer for a composition. */
export function latestPointerPath(compDir: string, platform: string): string {
  return join(compDir, latestPointerName(platform));
}

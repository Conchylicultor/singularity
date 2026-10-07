import type { Outdated } from "./updater";

/** One updater's share of an upgrade task: what it found outdated. */
export interface OutdatedUpdater {
  updaterId: string;
  outdated: readonly Outdated[];
  /** Repo-relative file where a hold for this updater is added. */
  holdsFile: string;
}

/** The title of the batched upgrade task. */
export function upgradeTaskTitle(batch: readonly OutdatedUpdater[]): string {
  return `Upgrade ${batch
    .map((u) => `${u.updaterId}: ${u.outdated.map(formatOutdated).join(", ")}`)
    .join("; ")}`;
}

function formatOutdated(o: Outdated): string {
  return `${o.name} ${o.current ?? "(new)"} → ${o.latest}`;
}

/**
 * The `{{outdated}}` variable of the upgrade prompt: each outdated updater, the
 * file its holds live in, and every release move it found.
 */
export function outdatedSections(batch: readonly OutdatedUpdater[]): string {
  return batch
    .map(
      (u) =>
        `\`${u.updaterId}\` (holds in \`${u.holdsFile}\`):\n${u.outdated.map((o) => `- ${formatOutdated(o)}`).join("\n")}`,
    )
    .join("\n\n");
}

/**
 * The default prompt template of the batched upgrade task — what the build
 * commits as the Dependency upgrades config's `prompt`. Fixed steps: the agent
 * never improvises the gate, it runs the one command that implements it.
 * `{{pushPolicy}}` is what the automation's Push setting allows, scoped by
 * step 2 to an `upgraded` verdict and an `ok` build.
 */
export const DEPS_UPGRADE_PROMPT = `Newer releases are available (seen on main by the Dependency upgrades automation):

{{outdated}}

Move this worktree to them, all in this one task. You own proving it works.

1. Run \`./singularity deps upgrade\` (in the background — it runs the full check and test suites twice).
   With no updater named it moves EVERY updater together, behind one baseline and one candidate run: it compares
   every check, test and the moved inputs' smoke tests on the current releases against the new ones, and writes its
   verdict to \`deps-upgrade.json\` in this worktree's data dir (the command prints the path).

2. Verdict \`upgraded\`: run \`./singularity build\` and confirm \`build-status.json\` says \`ok\`. Then:
   {{pushPolicy}}
   A push's message names the moves: \`chore(deps): <updater> <name> <from> → <to>, …\`. Any authorization to push
   covers the lock moves and any fix or hold you made for them, nothing else.

3. Verdict \`regressed\`: every lock was put back. Find the release responsible — one updater at a time
   (\`./singularity deps upgrade <updater>\`), then one input at a time within it
   (\`./singularity deps upgrade <updater> --only <name>\`). For that release:
   - If the bug is ours (code relying on old behavior), fix it.
   - If it is upstream, find or file the upstream issue, then add a hold for that release in that updater's holds
     file (listed above) with the reason and the issue URL.
   Then run \`./singularity deps upgrade\` again over everything, and go back to step 2 on its verdict.

4. Verdict \`current\`: nothing to do. Everything is already on its latest release.

If you cannot reach a clear verdict (the command itself fails, a regression you cannot attribute, a flaky gate that
never settles), do NOT push: raise a flag describing what you saw.`;

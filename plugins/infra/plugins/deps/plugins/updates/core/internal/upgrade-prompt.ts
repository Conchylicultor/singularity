import type { Outdated } from "./updater";

/** The title of an updater's upgrade task. */
export function upgradeTaskTitle(
  updaterId: string,
  outdated: readonly Outdated[],
): string {
  return `Upgrade ${updaterId}: ${outdated.map(formatOutdated).join(", ")}`;
}

function formatOutdated(o: Outdated): string {
  return `${o.name} ${o.current ?? "(new)"} → ${o.latest}`;
}

/**
 * The standing instructions of an upgrade task. Fixed text: the agent never
 * improvises the gate, it runs the one command that implements it, and the
 * push authorization below is scoped to exactly that command's verdict.
 */
export function upgradeTaskDescription(args: {
  updaterId: string;
  outdated: readonly Outdated[];
  /** Repo-relative file where a hold is added. */
  holdsFile: string;
}): string {
  const { updaterId, outdated, holdsFile } = args;
  const command = `./singularity deps upgrade ${updaterId}`;
  const lines = outdated.map((o) => `- ${formatOutdated(o)}`);
  return `Newer releases are available for the \`${updaterId}\` updater (seen on main by the daily deps.detect-outdated job):

${lines.join("\n")}

Move this worktree to them and land it. You own proving it works.

1. Run \`${command}\` (in the background — it runs the full check and test suites twice).
   It compares every check, test and the moved inputs' smoke tests on the current releases against the new ones,
   and writes its verdict to \`deps-upgrade-${updaterId}.json\` in this worktree's data dir (the command prints the path).

2. Verdict \`upgraded\`: run \`./singularity build\` and confirm \`build-status.json\` says \`ok\`. Then push with
   \`./singularity push -m "chore(deps): ${updaterId} <name> <from> → <to>, …"\`.
   **You are authorized to push this task's change without asking**, as long as the verdict is \`upgraded\`
   and the build is \`ok\`. This authorization covers the lock move and any fix you made for it, nothing else.

3. Verdict \`regressed\`: the lock was put back. Find the input responsible with
   \`${command} --only <name>\`, one at a time, and push the ones that come out \`upgraded\`.
   For the release that regresses:
   - If the bug is ours (code relying on old behavior), fix it and prove it with the same command.
   - If it is upstream, find or file the upstream issue, then add a hold for that release in
     \`${holdsFile}\` with the reason and the issue URL, and push that.

4. Verdict \`current\`: nothing to do. Everything is already on its latest release.

If you cannot reach a clear verdict (the command itself fails, a regression you cannot attribute, a flaky gate that
never settles), do NOT push: raise a flag describing what you saw.`;
}

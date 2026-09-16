/**
 * The standing instructions of a toolchain-upgrade task. Fixed text: the agent
 * never improvises the gate, it runs the one command that implements it, and
 * the push authorization below is scoped to exactly that command's verdict.
 */
export function upgradeTaskDescription(
  outdated: ReadonlyArray<{ tool: string; current: string; latest: string }>,
): string {
  const lines = outdated.map((o) => `- ${o.tool}: ${o.current} → ${o.latest}`);
  return `Newer toolchain releases are available (seen on main by the daily toolchain.detect-outdated job):

${lines.join("\n")}

Move this worktree to them and land it. You own proving it works.

1. Run \`./singularity toolchain upgrade\` (in the background — it runs the full check and test suites twice).
   It compares every check, test and the moved tools' smoke tests on the current releases against the new ones,
   and writes its verdict to \`toolchain-upgrade.json\` in this worktree's data dir (the command prints the path).

2. Verdict \`upgraded\`: run \`./singularity build\` and confirm \`build-status.json\` says \`ok\`. Then push with
   \`./singularity push -m "chore(toolchain): <tool> <from> → <to>, …"\`.
   **You are authorized to push this task's change without asking**, as long as the verdict is \`upgraded\`
   and the build is \`ok\`. This authorization covers the mise.lock move and any fix you made for it, nothing else.

3. Verdict \`regressed\`: mise.lock was put back. Find the tool responsible with
   \`./singularity toolchain upgrade --tool <name>\`, one tool at a time, and push the tools that come out \`upgraded\`.
   For the release that regresses:
   - If the bug is ours (code relying on old behavior), fix it and prove it with the same command.
   - If it is upstream, find or file the upstream issue, then add a \`hold\` for that release in
     \`plugins/toolchain/core/internal/tools.ts\` with the reason and the issue URL, and push that.

4. Verdict \`current\`: nothing to do. Every tool is already on its latest release.

If you cannot reach a clear verdict (the command itself fails, a regression you cannot attribute, a flaky gate that
never settles), do NOT push: raise a flag describing what you saw.`;
}

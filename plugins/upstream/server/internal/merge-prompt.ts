import { WORKTREES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";

/** What the instructions need to name. A structural shape, so this module is a
 * pure function of plain data — no zod, no report row, no database. */
export interface UpstreamUpdates {
  /** The remote-tracking ref the commits were counted against, e.g. `origin/main`. */
  ref: string;
  /** The URL that ref points at. */
  url: string;
  /** How many commits upstream holds that local `main` does not. */
  count: number;
  /** The newest of them, newest first — possibly fewer than `count`. */
  newest: ReadonlyArray<{ sha: string; subject: string }>;
}

function commitLines(d: UpstreamUpdates): string {
  const lines = d.newest.map((c) => `- \`${c.sha.slice(0, 9)}\` ${c.subject}`);
  const shown = d.newest.length;
  if (shown < d.count) lines.push(`- … and ${d.count - shown} older`);
  return lines.join("\n");
}

/**
 * The standing instructions of an upstream-update task.
 *
 * Fixed text, and deliberately short on judgement calls: the mechanical half is
 * one command (`./singularity upstream merge`), so the agent never re-derives
 * the fetch/merge/refspec dance from prose. What is left is the part only a
 * person present can decide — a conflicted migration — and the part the agent
 * must NOT do, which is land it.
 *
 * Nothing files this automatically. The daily job files a report; the task is
 * minted on demand when the user presses Investigate, and this is what it says.
 */
export function upstreamMergeInstructions(d: UpstreamUpdates): string {
  return `Upstream has ${d.count} commit${d.count === 1 ? "" : "s"} this checkout does not, on \`${d.ref}\` (${d.url}).

Newest first:

${commitLines(d)}

Bring them into THIS worktree and stop there. You are not landing them — the user is.

1. Run \`./singularity upstream merge\` in this worktree. It fetches upstream and merges
   \`${d.ref}\` into the branch you are on.
   This is the one sanctioned merge in this repo: rebasing the user's own trunk onto
   upstream would replay their entire history on every update and rewrite \`main\` under
   every open worktree.

2. Resolve whatever conflicts it leaves in the tree.
   - **Generated files re-derive themselves.** The \`.gitattributes\` merge drivers take the
     upstream side, and \`./singularity push\` re-runs the generators over the merged tree.
     Do not hand-resolve a generated artifact.
   - **A conflicted migration is the one thing to stop on.** Two sides altering the same
     table is a decision a person makes, not a merge you resolve. Report it and wait.
   Then \`git add\` what you resolved and run \`./singularity upstream merge --continue\`, which
   concludes the merge for you.

3. Run \`./singularity build\` in the background, then confirm the deploy receipt at
   \`${WORKTREES_DIR_DISPLAY}/<worktree>/build-status.json\` says \`"status": "ok"\`.

4. Open \`http://<worktree>.localhost:9000\` and check the app still works: it comes up, the
   screens you can reach render, and Debug → Reports holds nothing new.

5. Report what changed — what the merge brought in, what you had to resolve, and anything
   that looked off — and then **wait. Do not push.** The user lands this.

If the merge cannot be completed (a conflict you cannot resolve, a build that will not come
up, a migration clash), leave the tree as it is, say so, and wait for instructions. Do not
abandon the merge to make the tree look clean.`;
}

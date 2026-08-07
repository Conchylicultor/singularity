import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getCommitInfo } from "@plugins/code-explorer/plugins/code-api/core";
import { resolved, unresolved } from "@plugins/primitives/plugins/live-state/core";
import {
  LOG_FORMAT,
  parseGitLog,
  tryRunGit,
} from "@plugins/primitives/plugins/commit-list/server";
import { isAllowedRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleCommitInfo = implement(getCommitInfo, async ({ params, query }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const { sha } = query;
  if (!isAllowedRef(sha)) throw new HttpError(400, "Invalid sha");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  // A sha naming no object in this repository is a determinate answer, not a
  // failure: `unresolved` with 200, never a 404 (which means "unknown
  // worktree"). `tryRunGit` still throws `WorktreeGoneError` when the checkout
  // itself has vanished — that propagates as a 500, same as the sibling
  // commit-files handler.
  const result = await tryRunGit(
    ["log", "-1", `--format=${LOG_FORMAT}`, sha, "--"],
    wtPath,
  );
  if (!result.ok) return unresolved(`no commit ${sha}`);

  const row = parseGitLog(result.stdout)[0];
  // An ok exit that parses to nothing is a broken premise (`git log -1` either
  // fails or emits exactly one record), so throw rather than vouch for a row
  // we do not have.
  if (!row) {
    throw new HttpError(500, `git log -1 ${sha} produced no parseable commit`);
  }
  return resolved(row);
});

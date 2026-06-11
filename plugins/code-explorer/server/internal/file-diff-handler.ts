import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getFileDiff as getFileDiffEndpoint } from "@plugins/code-explorer/plugins/code-api/core";
import { getFileDiff } from "./get-file-diff";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleFileDiff = implement(getFileDiffEndpoint, async ({ params, query }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const { path } = query;
  const base = query.base ?? "HEAD";
  const head = query.head ?? undefined;
  const from = query.from ?? undefined;

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const result = await getFileDiff(wtPath, path, base, head, from);
  if (result.kind === "ok") {
    return { diff: result.diff };
  }
  throw new HttpError(result.status, result.message);
});

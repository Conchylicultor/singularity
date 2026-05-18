import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getFileDiff as getFileDiffEndpoint } from "../../shared/endpoints";
import { getFileDiff } from "./get-file-diff";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleFileDiff = implement(getFileDiffEndpoint, async ({ params, req }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) throw new HttpError(400, "Missing path");
  const base = url.searchParams.get("base") ?? "HEAD";
  const head = url.searchParams.get("head") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const result = await getFileDiff(wtPath, path, base, head, from);
  if (result.kind === "ok") {
    return { diff: result.diff };
  }
  throw new HttpError(result.status, result.message);
});

import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getCommitFiles } from "../../shared/endpoints";
import { getRangeFiles, resolveParentSha } from "./get-push-files";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleCommitFiles = implement(getCommitFiles, async ({ params, req }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const url = new URL(req.url);
  const sha = url.searchParams.get("sha");
  if (!sha) throw new HttpError(400, "Missing sha");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const baseSha = await resolveParentSha(wtPath, sha);
  if (!baseSha) {
    return { files: [], baseSha: sha, headSha: sha };
  }

  const files = await getRangeFiles(wtPath, baseSha, sha);
  if (!files) throw new HttpError(500, "git diff failed");

  return { files, baseSha, headSha: sha };
});

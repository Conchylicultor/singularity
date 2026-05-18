import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getPushFiles } from "../../shared/endpoints";
import { listPushesByPushId } from "@plugins/tasks-core/server";
import { getRangeFiles, resolveParentSha } from "./get-push-files";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handlePushFiles = implement(getPushFiles, async ({ params, req }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const url = new URL(req.url);
  const pushId = url.searchParams.get("pushId");
  if (!pushId) throw new HttpError(400, "Missing pushId");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  // Commits in a push share a `pushId`; rows are returned in chronological
  // order. Diff range = (parent of earliest)..latest.
  const commits = await listPushesByPushId(pushId);
  if (commits.length === 0) {
    throw new HttpError(404, "Unknown pushId");
  }

  const earliest = commits[0]!;
  const latest = commits[commits.length - 1]!;
  const baseSha = await resolveParentSha(wtPath, earliest.sha);
  if (!baseSha) {
    throw new HttpError(500, "Cannot resolve push base");
  }
  const headSha = latest.sha;

  const files = await getRangeFiles(wtPath, baseSha, headSha);
  if (!files) throw new HttpError(500, "git diff failed");

  return { files, baseSha, headSha };
});

import { listPushesByPushId } from "@plugins/tasks-core/server";
import { getRangeFiles, resolveParentSha } from "./get-push-files";
import { resolveWorktreePath } from "./resolve-worktree-path";

export async function handlePushFiles(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const pushId = url.searchParams.get("pushId");
  if (!pushId) return new Response("Missing pushId", { status: 400 });

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  // Commits in a push share a `pushId`; rows are returned in chronological
  // order. Diff range = (parent of earliest)..latest.
  const commits = await listPushesByPushId(pushId);
  if (commits.length === 0) {
    return new Response("Unknown pushId", { status: 404 });
  }

  const earliest = commits[0]!;
  const latest = commits[commits.length - 1]!;
  const baseSha = await resolveParentSha(wtPath, earliest.sha);
  if (!baseSha) {
    return new Response("Cannot resolve push base", { status: 500 });
  }
  const headSha = latest.sha;

  const files = await getRangeFiles(wtPath, baseSha, headSha);
  if (!files) return new Response("git diff failed", { status: 500 });

  return Response.json({ files, baseSha, headSha });
}

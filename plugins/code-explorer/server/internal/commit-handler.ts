import { getRangeFiles, resolveParentSha } from "./get-push-files";
import { resolveWorktreePath } from "./resolve-worktree-path";

export async function handleCommitFiles(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const sha = url.searchParams.get("sha");
  if (!sha) return new Response("Missing sha", { status: 400 });

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  const baseSha = await resolveParentSha(wtPath, sha);
  if (!baseSha) {
    return Response.json({ files: [], baseSha: sha, headSha: sha });
  }

  const files = await getRangeFiles(wtPath, baseSha, sha);
  if (!files) return new Response("git diff failed", { status: 500 });

  return Response.json({ files, baseSha, headSha: sha });
}

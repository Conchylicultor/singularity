import { getFileDiff } from "./get-file-diff";
import { resolveWorktreePath } from "./resolve-worktree-path";

export async function handleFileDiff(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });
  const base = url.searchParams.get("base") ?? "HEAD";

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  const result = await getFileDiff(wtPath, path, base);
  if (result.kind === "ok") {
    return Response.json({ diff: result.diff });
  }
  return new Response(result.message, { status: result.status });
}

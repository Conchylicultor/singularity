import { resolveWorktreePath } from "./resolve-worktree-path";

import { GIT } from "@plugins/infra/plugins/paths/server";

export async function handleTree(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  const proc = Bun.spawn(
    [GIT, "-C", wtPath, "ls-files", "--cached", "--others", "--exclude-standard"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    return new Response("git ls-files failed", { status: 500 });
  }

  const files = out
    .split("\n")
    .filter((line) => line.length > 0)
    .sort();

  return Response.json({ files });
}

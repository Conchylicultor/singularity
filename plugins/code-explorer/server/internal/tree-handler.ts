import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { getCodeTree } from "../../shared/endpoints";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleTree = implement(getCodeTree, async ({ params }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "-C", wtPath, "ls-files", "--cached", "--others", "--exclude-standard"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new HttpError(500, "git ls-files failed");
  }

  const files = out
    .split("\n")
    .filter((line) => line.length > 0)
    .sort();

  return { files };
});

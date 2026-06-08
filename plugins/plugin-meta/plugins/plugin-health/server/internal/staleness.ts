import { GIT } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

export async function commitsSince(
  commitHash: string,
  pluginPath: string,
): Promise<number> {
  const cwd = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [
      GIT,
      "--no-optional-locks",
      "rev-list",
      "--count",
      `${commitHash}..HEAD`,
      "--",
      `plugins/${pluginPath}`,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  const text = await new Response(proc.stdout).text();
  return parseInt(text.trim(), 10) || 0;
}

export async function apiChangedSince(
  commitHash: string,
  pluginPath: string,
): Promise<boolean> {
  const cwd = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [
      GIT,
      "--no-optional-locks",
      "diff",
      "--name-only",
      commitHash,
      "HEAD",
      "--",
      `plugins/${pluginPath}/web/index.ts`,
      `plugins/${pluginPath}/server/index.ts`,
      `plugins/${pluginPath}/core/index.ts`,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  const text = await new Response(proc.stdout).text();
  return text.trim().length > 0;
}

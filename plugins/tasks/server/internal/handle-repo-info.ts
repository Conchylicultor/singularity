import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

import { GIT } from "@plugins/infra/plugins/paths/server";

let cached: { githubBase: string | null } | null = null;

function parseGithubBase(remote: string): string | null {
  const trimmed = remote.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  const https = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return `https://github.com/${https[1]}/${https[2]}`;
  return null;
}

async function loadRepoInfo(): Promise<{ githubBase: string | null }> {
  if (cached) return cached;
  const cwd = await ensureMainWorktreeRoot();
  const proc = Bun.spawn([GIT, "remote", "get-url", "origin"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    cached = { githubBase: null };
    return cached;
  }
  cached = { githubBase: parseGithubBase(text) };
  return cached;
}

export async function handleRepoInfo(): Promise<Response> {
  return Response.json(await loadRepoInfo());
}

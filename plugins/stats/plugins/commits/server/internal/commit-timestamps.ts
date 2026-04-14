import { getMainWorktreeRoot } from "@plugins/conversations/server/internal/worktree";

const GIT = "/usr/bin/git";
const TTL_MS = 30_000;

export interface CommitInfo {
  iso: string;
  added: number;
  removed: number;
}

let cache: { expires: number; commits: CommitInfo[] } | null = null;

export async function getCommits(): Promise<CommitInfo[]> {
  if (cache && cache.expires > Date.now()) return cache.commits;
  const root = await getMainWorktreeRoot();
  const proc = Bun.spawn(
    [GIT, "-C", root, "log", "--format=__C__%cI", "--numstat", "--reverse"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("__C__")) {
      if (current) commits.push(current);
      current = { iso: line.slice(5).trim(), added: 0, removed: 0 };
    } else if (current && line.trim()) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const ins = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
        const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
        current.added += ins;
        current.removed += del;
      }
    }
  }
  if (current) commits.push(current);

  cache = { expires: Date.now() + TTL_MS, commits };
  return commits;
}

export async function getCommitTimestamps(): Promise<string[]> {
  return (await getCommits()).map((c) => c.iso);
}

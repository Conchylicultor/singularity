import { ensureMainWorktreeRoot } from "@server/worktree";

import { GIT } from "@plugins/infra/plugins/paths/server";
const TTL_MS = 30_000;

export interface CommitInfo {
  sha: string;
  iso: string;
  pushId: string | null;
  added: number;
  removed: number;
  byExt: Record<string, { added: number; removed: number }>;
}

async function parseGitLog(args: string[]): Promise<CommitInfo[]> {
  const root = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [
      GIT, "-C", root, "log",
      "--format=__C__%H %cI %(trailers:key=Singularity-Push,valueonly)",
      "--numstat", "--reverse", ...args,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("__C__")) {
      if (current) commits.push(current);
      const header = line.slice(5).trim();
      const firstSpace = header.indexOf(" ");
      const sha = firstSpace === -1 ? header : header.slice(0, firstSpace);
      const rest = firstSpace === -1 ? "" : header.slice(firstSpace + 1);
      const secondSpace = rest.indexOf(" ");
      const iso = secondSpace === -1 ? rest : rest.slice(0, secondSpace);
      const rawPushId = secondSpace === -1 ? "" : rest.slice(secondSpace + 1).trim();
      const pushId = rawPushId || null;
      current = { sha, iso, pushId, added: 0, removed: 0, byExt: {} };
    } else if (current && line.trim()) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const ins = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
        const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
        current.added += ins;
        current.removed += del;
        const filepath = parts[2];
        const dotIdx = filepath.lastIndexOf(".");
        const ext = dotIdx >= 0 ? filepath.slice(dotIdx).toLowerCase() : "(none)";
        const e = current.byExt[ext] ?? { added: 0, removed: 0 };
        e.added += ins;
        e.removed += del;
        current.byExt[ext] = e;
      }
    }
  }
  if (current) commits.push(current);
  return commits;
}

let cache: { expires: number; commits: CommitInfo[] } | null = null;
const filteredCache = new Map<string, { expires: number; commits: CommitInfo[] }>();

export async function getCommits(): Promise<CommitInfo[]> {
  if (cache && cache.expires > Date.now()) return cache.commits;
  const commits = await parseGitLog([]);
  cache = { expires: Date.now() + TTL_MS, commits };
  return commits;
}

export async function getCommitsExcludingPaths(excludedPaths: string[]): Promise<CommitInfo[]> {
  const key = [...excludedPaths].sort().join("|");
  const cached = filteredCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.commits;
  const excludeArgs = excludedPaths.map((p) => `:(exclude)${p}`);
  const commits = await parseGitLog(["--", ".", ...excludeArgs]);
  filteredCache.set(key, { expires: Date.now() + TTL_MS, commits });
  return commits;
}

export async function getCommitTimestamps(): Promise<string[]> {
  return (await getCommits()).map((c) => c.iso);
}

/**
 * Collapses commits sharing a Singularity-Push trailer into one representative
 * commit per push group: timestamp of the last commit, line stats summed.
 * Commits without a push id are kept as-is.
 */
export function deduplicateByPushId(commits: CommitInfo[]): CommitInfo[] {
  const result: CommitInfo[] = [];
  const byPushId = new Map<string, CommitInfo>();

  for (const commit of commits) {
    if (!commit.pushId) {
      result.push(commit);
      continue;
    }
    const existing = byPushId.get(commit.pushId);
    if (!existing) {
      const merged: CommitInfo = { ...commit, byExt: { ...commit.byExt } };
      byPushId.set(commit.pushId, merged);
      result.push(merged);
    } else {
      existing.iso = commit.iso;
      existing.added += commit.added;
      existing.removed += commit.removed;
      for (const [ext, stats] of Object.entries(commit.byExt)) {
        const e = existing.byExt[ext] ?? { added: 0, removed: 0 };
        e.added += stats.added;
        e.removed += stats.removed;
        existing.byExt[ext] = e;
      }
    }
  }

  return result;
}

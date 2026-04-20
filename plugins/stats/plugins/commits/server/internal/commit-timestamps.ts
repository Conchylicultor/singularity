import { ensureMainWorktreeRoot } from "@server/worktree";

const GIT = "/usr/bin/git";
const TTL_MS = 30_000;

export interface CommitInfo {
  sha: string;
  iso: string;
  added: number;
  removed: number;
  byExt: Record<string, { added: number; removed: number }>;
}

async function parseGitLog(args: string[]): Promise<CommitInfo[]> {
  const root = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [GIT, "-C", root, "log", "--format=__C__%H %cI", "--numstat", "--reverse", ...args],
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
      const spaceIdx = header.indexOf(" ");
      const sha = spaceIdx === -1 ? header : header.slice(0, spaceIdx);
      const iso = spaceIdx === -1 ? "" : header.slice(spaceIdx + 1);
      current = { sha, iso, added: 0, removed: 0, byExt: {} };
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

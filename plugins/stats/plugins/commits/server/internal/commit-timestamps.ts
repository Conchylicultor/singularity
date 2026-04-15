import { ensureMainWorktreeRoot } from "@plugins/conversations/server/internal/worktree";

const GIT = "/usr/bin/git";
const TTL_MS = 30_000;

// Commits to exclude from line-change stats: a one-shot trial scaffold that was
// added and immediately removed, distorting the lines-changed charts.
const LINE_STATS_EXCLUDED_SHAS = new Set<string>([
  "983277b35b866c200cbee400383fdee63368d7e8",
  "ea912679590b69ad437396232d2a5707ca27e53d",
]);

export interface CommitInfo {
  iso: string;
  added: number;
  removed: number;
}

let cache: { expires: number; commits: CommitInfo[] } | null = null;

export async function getCommits(): Promise<CommitInfo[]> {
  if (cache && cache.expires > Date.now()) return cache.commits;
  const root = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [GIT, "-C", root, "log", "--format=__C__%H %cI", "--numstat", "--reverse"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;
  let skipLines = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("__C__")) {
      if (current) commits.push(current);
      const header = line.slice(5).trim();
      const spaceIdx = header.indexOf(" ");
      const sha = spaceIdx === -1 ? header : header.slice(0, spaceIdx);
      const iso = spaceIdx === -1 ? "" : header.slice(spaceIdx + 1);
      skipLines = LINE_STATS_EXCLUDED_SHAS.has(sha);
      current = { iso, added: 0, removed: 0 };
    } else if (current && !skipLines && line.trim()) {
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

import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

import { GIT } from "@plugins/infra/plugins/paths/server";
const TTL_MS = 30_000;

export interface CommitInfo {
  sha: string;
  iso: string;
  pushId: string | null;
  conversationId: string | null;
  added: number;
  removed: number;
  byExt: Record<string, { added: number; removed: number }>;
}

async function parseGitLog(args: string[]): Promise<CommitInfo[]> {
  const root = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [
      GIT, "-C", root, "log",
      "--format=__C__%H\x1f%cI\x1f%(trailers:key=Singularity-Push,valueonly)\x1f%(trailers:key=Singularity-Conversation,valueonly)",
      "--numstat", "--reverse", ...args,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  // Split on __C__ markers — each chunk is one commit's header + numstat.
  // Trailer values append newlines, so the \x1f-delimited header may span
  // multiple lines; splitting on __C__ captures the full record.
  const chunks = text.split("__C__").filter(Boolean);
  const commits: CommitInfo[] = [];
  for (const chunk of chunks) {
    const fields = chunk.split("\x1f");
    const sha = (fields[0] ?? "").trim();
    const iso = (fields[1] ?? "").trim();
    const pushId = (fields[2] ?? "").trim() || null;
    const rest = fields[3] ?? "";
    const restLines = rest.split("\n");
    const conversationId = (restLines[0] ?? "").trim() || null;

    const current: CommitInfo = { sha, iso, pushId, conversationId, added: 0, removed: 0, byExt: {} };
    for (const line of restLines.slice(1)) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const ins = parts[0]! === "-" ? 0 : parseInt(parts[0]!, 10) || 0;
        const del = parts[1]! === "-" ? 0 : parseInt(parts[1]!, 10) || 0;
        current.added += ins;
        current.removed += del;
        const filepath = parts[2]!;
        const dotIdx = filepath.lastIndexOf(".");
        const ext = dotIdx >= 0 ? filepath.slice(dotIdx).toLowerCase() : "(none)";
        const e = current.byExt[ext] ?? { added: 0, removed: 0 };
        e.added += ins;
        e.removed += del;
        current.byExt[ext] = e;
      }
    }
    commits.push(current);
  }
  return commits;
}

let cache: { expires: number; commits: CommitInfo[] } | null = null;
const filteredCache = new Map<string, { expires: number; commits: CommitInfo[] }>();

export async function getCommits(): Promise<CommitInfo[]> {
  if (cache && cache.expires > Date.now()) {
    return cache.commits;
  }
  const commits = await parseGitLog([]);
  cache = { expires: Date.now() + TTL_MS, commits };
  return commits;
}

export async function getCommitsExcludingPaths(excludedPaths: string[]): Promise<CommitInfo[]> {
  const key = [...excludedPaths].sort().join("|");
  const cached = filteredCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.commits;
  }
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
      if (!existing.conversationId && commit.conversationId) {
        existing.conversationId = commit.conversationId;
      }
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

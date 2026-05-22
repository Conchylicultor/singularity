import type { CommitDelta, CommitRow, CommitsGraph } from "../../shared/protocol";
import { runGit, LOG_FORMAT, parseGitLog } from "@plugins/primitives/plugins/commit-list/server";

const MAIN = "main";
const MAX_COMMITS = 200;

const ZERO_DELTA: CommitDelta = {
  ahead: 0,
  behind: 0,
  mergeBase: null,
  branch: null,
};

async function readBranch(worktreePath: string): Promise<string | null> {
  const out = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
  const trimmed = out?.trim();
  if (!trimmed || trimmed === "HEAD") return null;
  return trimmed;
}

async function readMergeBase(worktreePath: string): Promise<string | null> {
  const out = await runGit(["merge-base", MAIN, "HEAD"], worktreePath);
  const trimmed = out?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

async function readDeltaCounts(
  worktreePath: string,
): Promise<{ ahead: number; behind: number } | null> {
  // `--left-right --count <left>...<right>` prints "<left-only>\t<right-only>".
  // left  = main only  = behind
  // right = HEAD only  = ahead
  const out = await runGit(
    ["rev-list", "--left-right", "--count", `${MAIN}...HEAD`],
    worktreePath,
  );
  if (out === null) return null;
  const parts = out.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const behind = Number.parseInt(parts[0] ?? "0", 10);
  const ahead = Number.parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(behind) || Number.isNaN(ahead)) return null;
  return { ahead, behind };
}

export async function computeDelta(worktreePath: string): Promise<CommitDelta> {
  const branch = await readBranch(worktreePath);
  const mergeBase = await readMergeBase(worktreePath);
  if (mergeBase === null) {
    return { ...ZERO_DELTA, branch };
  }
  const counts = await readDeltaCounts(worktreePath);
  if (counts === null) {
    return { ...ZERO_DELTA, branch, mergeBase };
  }
  return { ahead: counts.ahead, behind: counts.behind, mergeBase, branch };
}

async function computeCommitsFromShas(
  shas: string[],
  worktreePath: string,
): Promise<CommitRow[]> {
  if (shas.length === 0) return [];
  const out = await runGit(
    ["log", "--no-walk", `--format=${LOG_FORMAT}`, ...shas],
    worktreePath,
  );
  if (out === null) return [];
  return parseGitLog(out);
}

const MAX_BEHIND = 50;

export async function computeGraph(
  worktreePath: string,
  pushedShas: string[] = [],
): Promise<CommitsGraph> {
  const delta = await computeDelta(worktreePath);
  if (delta.mergeBase === null) {
    return { ...delta, commits: [], landedCommits: [], behindCommits: [] };
  }
  const pendingRange = `${delta.mergeBase}..HEAD`;
  const behindRange = `HEAD..${MAIN}`;
  const [pendingOut, behindOut, landedAll] = await Promise.all([
    runGit(["log", `--max-count=${MAX_COMMITS}`, `--format=${LOG_FORMAT}`, pendingRange], worktreePath),
    runGit(["log", `--max-count=${MAX_BEHIND}`, `--format=${LOG_FORMAT}`, behindRange], worktreePath),
    computeCommitsFromShas(pushedShas, worktreePath),
  ]);
  const pendingCommits = pendingOut === null ? [] : parseGitLog(pendingOut);
  const behindCommits = behindOut === null ? [] : parseGitLog(behindOut);
  const pendingShas = new Set(pendingCommits.map((c) => c.sha));
  const landedCommits = landedAll.filter((c) => !pendingShas.has(c.sha));
  return { ...delta, commits: pendingCommits, landedCommits, behindCommits };
}

import type { CommitDelta, CommitRow, CommitsGraph } from "../../shared/protocol";
import { runGit } from "./git";

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

// %x09 = tab between fields; %x00 = NUL between records. Subjects are emitted
// last so any literal tabs in the subject don't shift later fields.
const LOG_FORMAT =
  "%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%s%x00";

function parseCommits(out: string): CommitRow[] {
  const rows: CommitRow[] = [];
  for (const raw of out.split("\0")) {
    const line = raw.replace(/^\n/, "");
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [sha, shortSha, parentsStr, authorName, authorEmail, authoredAt, ...rest] =
      parts as [string, string, string, string, string, string, ...string[]];
    // Subject can contain tabs — rejoin any extra fields beyond the 7th.
    const subject = rest.join("\t");
    const parents =
      parentsStr.length > 0 ? parentsStr.split(" ").filter(Boolean) : [];
    rows.push({
      sha,
      shortSha,
      subject,
      authorName,
      authorEmail,
      authoredAt,
      parents,
    });
  }
  return rows;
}

export async function computeGraph(worktreePath: string): Promise<CommitsGraph> {
  const delta = await computeDelta(worktreePath);
  if (delta.mergeBase === null) {
    return { ...delta, commits: [] };
  }
  const range = `${delta.mergeBase}..HEAD`;
  const out = await runGit(
    ["log", `--max-count=${MAX_COMMITS}`, `--format=${LOG_FORMAT}`, range],
    worktreePath,
  );
  if (out === null) {
    return { ...delta, commits: [] };
  }
  return { ...delta, commits: parseCommits(out) };
}

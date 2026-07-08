import type { CommitDelta, CommitRow, CommitsGraph } from "../../shared/protocol";
import { runGit, tryRunGit, GitError, LOG_FORMAT, parseGitLog } from "@plugins/primitives/plugins/commit-list/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { createGitStateMemo } from "@plugins/infra/plugins/git-read-cache/server";
import { lastKnownMainSha } from "@plugins/infra/plugins/git-watcher/server";
import { createInflight } from "@plugins/packages/plugins/inflight/core";

const MAIN = "main";
const MAX_COMMITS = 200;
const MAX_BEHIND = 50;

const ZERO_DELTA: CommitDelta = {
  ahead: 0,
  behind: 0,
  mergeBase: null,
  branch: null,
};

async function readBranch(worktreePath: string): Promise<string | null> {
  // runGit throws on a real git failure; a detached HEAD legitimately reports
  // the literal "HEAD" (no branch name) → null.
  const trimmed = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath)).trim();
  if (!trimmed || trimmed === "HEAD") return null;
  return trimmed;
}

async function readMergeBase(worktreePath: string): Promise<string | null> {
  // `git merge-base` exits 1 legitimately when the branches share no common
  // ancestor — that is a real "no merge-base" answer (→ null), NOT a failure.
  // Any other non-zero exit is a genuine failure and must throw so the caller
  // aborts the recompute and keeps its previous cache (never a "" collision).
  const res = await tryRunGit(["merge-base", MAIN, "HEAD"], worktreePath);
  if (!res.ok) {
    if (res.exitCode === 1) return null;
    throw new GitError({
      args: ["merge-base", MAIN, "HEAD"],
      cwd: worktreePath,
      exitCode: res.exitCode,
      stderr: res.stderr,
    });
  }
  const trimmed = res.stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readDeltaCounts(
  worktreePath: string,
): Promise<{ ahead: number; behind: number }> {
  // `--left-right --count <left>...<right>` prints "<left-only>\t<right-only>".
  // left  = main only  = behind
  // right = HEAD only  = ahead
  // runGit throws on failure — a false 0/0 is never manufactured from a failed read.
  const out = await runGit(
    ["rev-list", "--left-right", "--count", `${MAIN}...HEAD`],
    worktreePath,
  );
  const parts = out.trim().split(/\s+/);
  const behind = Number.parseInt(parts[0] ?? "", 10);
  const ahead = Number.parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(behind) || Number.isNaN(ahead)) {
    throw new Error(
      `rev-list --left-right --count returned unparseable output: ${JSON.stringify(out)}`,
    );
  }
  return { ahead, behind };
}

// Exact, uncapped one-sided commit count (the commit log is capped at
// MAX_COMMITS/MAX_BEHIND, so a count derived from the array would underreport on
// large divergences). Splitting the count this way lets `ahead` live in the
// pending half and `behind` in the behind half, each validated by its own key.
async function readCount(range: string, worktreePath: string): Promise<number> {
  // runGit throws on failure — a failed rev-list must never be absorbed as 0.
  const out = await runGit(["rev-list", "--count", range], worktreePath);
  const n = Number.parseInt(out.trim(), 10);
  if (Number.isNaN(n)) {
    throw new Error(`rev-list --count ${range} returned non-numeric output: ${JSON.stringify(out)}`);
  }
  return n;
}

async function computeDeltaCore(worktreePath: string): Promise<CommitDelta> {
  const branch = await readBranch(worktreePath);
  const mergeBase = await readMergeBase(worktreePath);
  if (mergeBase === null) {
    return { ...ZERO_DELTA, branch };
  }
  const counts = await readDeltaCounts(worktreePath);
  return { ahead: counts.ahead, behind: counts.behind, mergeBase, branch };
}

// ── delta: generic git-state memo (Stage 3) ────────────────────────────────
// Signature `${headSha}|${mainSha}` covers every input ahead/behind/mergeBase
// derive from. A hit (HEAD & main unchanged since last compute) returns the
// cached delta with NO heavy slot; worktree-keying coalesces the N attempts on
// one worktree onto one compute.

const deltaMemo = createGitStateMemo<CommitDelta>({ name: "commits-graph.delta" });

export async function probeHeadMain(
  worktreePath: string,
): Promise<{ headSha: string; mainSha: string }> {
  // Both reads are the thin ungated `runGit` (a rev-parse is microseconds);
  // `main` is read from git-watcher's in-memory sha when seeded, else an ungated
  // `rev-parse main` (never trust a missing watcher as "main unchanged").
  // runGit throws on failure — a failed read must NEVER coalesce to "" and poison
  // the cache signature (two different failures would collide on the same "|"
  // key). A throw here aborts the memo recompute, retaining the previous entry.
  const headSha = (await runGit(["rev-parse", "HEAD"], worktreePath)).trim();
  const mainSha =
    lastKnownMainSha() ?? (await runGit(["rev-parse", MAIN], worktreePath)).trim();
  return { headSha, mainSha };
}

export async function computeDelta(worktreePath: string): Promise<CommitDelta> {
  return deltaMemo.get(
    worktreePath,
    async () => {
      const { headSha, mainSha } = await probeHeadMain(worktreePath);
      return `${headSha}|${mainSha}`;
    },
    () => withHeavyReadSlot(() => computeDeltaCore(worktreePath)),
  );
}

async function computeCommitsFromShas(
  shas: string[],
  worktreePath: string,
): Promise<CommitRow[]> {
  if (shas.length === 0) return [];
  // runGit throws on failure — a failed log must never be absorbed as an empty chain.
  const out = await runGit(
    ["log", "--no-walk", `--format=${LOG_FORMAT}`, ...shas],
    worktreePath,
  );
  return parseGitLog(out);
}

// ── graph: bespoke split-signature two-half cache (Stage 2) ─────────────────
// The graph result is split into two independently-validated halves so a
// `main`-advance (changes behind only; HEAD & merge-base unchanged) reuses the
// expensive pending half. Its two-half structure is genuinely special, so it
// does NOT use the generic single-signature memo; it keeps its own bespoke
// cache + worktree-keyed single-flight.
//
// Keys (each a faithful function of the inputs that half reads):
//   pending : `${headSha}|${mergeBase}`          → { commits, ahead, branch }
//   behind  : `${mainSha}|${mergeBase}`          → { behindCommits, behind }
//   landed  : `${headSha}|${mergeBase}|${pushedShasKey}` → { landedCommits }
// landedCommits = pushedShas log filtered to exclude the pending set, so it must
// refresh whenever EITHER the pending set (headSha+mergeBase) OR pushedShas move.

interface PendingHalf {
  key: string;
  commits: CommitRow[];
  ahead: number;
  branch: string | null;
}
interface BehindHalf {
  key: string;
  behindCommits: CommitRow[];
  behind: number;
}
interface LandedPiece {
  key: string;
  landedCommits: CommitRow[];
}

const graphCache = new Map<
  string,
  { pending?: PendingHalf; behind?: BehindHalf; landed?: LandedPiece }
>();
const graphInflight = createInflight();

async function probeGraphState(
  worktreePath: string,
): Promise<{ headSha: string; mainSha: string; mergeBase: string | null }> {
  const { headSha, mainSha } = await probeHeadMain(worktreePath);
  const mergeBase = await readMergeBase(worktreePath);
  return { headSha, mainSha, mergeBase };
}

function pushedShasKey(pushedShas: string[]): string {
  return [...pushedShas].sort().join(",");
}

export async function computeGraph(
  worktreePath: string,
  pushedShas: string[] = [],
): Promise<CommitsGraph> {
  const { headSha, mainSha, mergeBase } = await probeGraphState(worktreePath);

  if (mergeBase === null) {
    // No common ancestor with main → empty graph. `branch` is still meaningful;
    // read it ungated (cheap) so the chip can show the branch name.
    const branch = await readBranch(worktreePath);
    return {
      ...ZERO_DELTA,
      branch,
      commits: [],
      landedCommits: [],
      behindCommits: [],
    };
  }

  const pendingKey = `${headSha}|${mergeBase}`;
  const behindKey = `${mainSha}|${mergeBase}`;
  const landedKey = `${headSha}|${mergeBase}|${pushedShasKey(pushedShas)}`;

  return graphInflight.run(worktreePath, async () => {
    const entry = graphCache.get(worktreePath) ?? {};
    const pendingHit = entry.pending?.key === pendingKey ? entry.pending : undefined;
    const behindHit = entry.behind?.key === behindKey ? entry.behind : undefined;
    const landedHit = entry.landed?.key === landedKey ? entry.landed : undefined;

    // All three pieces fresh ⇒ assemble from cache with ZERO gated work and NO
    // heavy slot acquired. This is the steady-state no-op notify path.
    if (pendingHit && behindHit && landedHit) {
      return assemble(pendingHit, behindHit, landedHit, mergeBase);
    }

    // Recompute only the stale pieces under a SINGLE heavy slot (one slot per
    // logical job). The probe above was fully ungated; the slot is acquired only
    // here, for exactly the missing `git log`s.
    //
    // Main-advance fast path: a `main` advance moves `mainSha` only — `headSha`
    // and `mergeBase` are unchanged, so `pendingKey` and (for an unchanged
    // pushedShas set) `landedKey` still match. Only `behindHit` is undefined, so
    // the expensive max-200 `mergeBase..HEAD` log below is skipped entirely; the
    // slot wraps just the cheap max-50 `HEAD..main` log.
    const result = await withHeavyReadSlot(async () => {
      const [pending, behind] = await Promise.all([
        pendingHit ?? recomputePending(worktreePath, mergeBase, pendingKey),
        behindHit ?? recomputeBehind(worktreePath, behindKey),
      ]);
      // landed depends on the pending set, so resolve pending first (above),
      // then compute landed against it if its key moved.
      const landed =
        landedHit ?? (await recomputeLanded(worktreePath, pushedShas, pending.commits, landedKey));
      return { pending, behind, landed };
    });

    graphCache.set(worktreePath, {
      pending: result.pending,
      behind: result.behind,
      landed: result.landed,
    });
    return assemble(result.pending, result.behind, result.landed, mergeBase);
  });
}

async function recomputePending(
  worktreePath: string,
  mergeBase: string,
  key: string,
): Promise<PendingHalf> {
  const pendingRange = `${mergeBase}..HEAD`;
  const [out, ahead, branch] = await Promise.all([
    runGit(["log", `--max-count=${MAX_COMMITS}`, `--format=${LOG_FORMAT}`, pendingRange], worktreePath),
    readCount(pendingRange, worktreePath),
    readBranch(worktreePath),
  ]);
  const commits = parseGitLog(out);
  return { key, commits, ahead, branch };
}

async function recomputeBehind(worktreePath: string, key: string): Promise<BehindHalf> {
  const behindRange = `HEAD..${MAIN}`;
  const [out, behind] = await Promise.all([
    runGit(["log", `--max-count=${MAX_BEHIND}`, `--format=${LOG_FORMAT}`, behindRange], worktreePath),
    readCount(behindRange, worktreePath),
  ]);
  const behindCommits = parseGitLog(out);
  return { key, behindCommits, behind };
}

async function recomputeLanded(
  worktreePath: string,
  pushedShas: string[],
  pendingCommits: CommitRow[],
  key: string,
): Promise<LandedPiece> {
  const landedAll = await computeCommitsFromShas(pushedShas, worktreePath);
  const pendingShaSet = new Set(pendingCommits.map((c) => c.sha));
  const landedCommits = landedAll.filter((c) => !pendingShaSet.has(c.sha));
  return { key, landedCommits };
}

function assemble(
  pending: PendingHalf,
  behind: BehindHalf,
  landed: LandedPiece,
  mergeBase: string,
): CommitsGraph {
  return {
    ahead: pending.ahead,
    behind: behind.behind,
    mergeBase,
    branch: pending.branch,
    commits: pending.commits,
    landedCommits: landed.landedCommits,
    behindCommits: behind.behindCommits,
  };
}

/** Drop a worktree's cached delta + graph state (subscription-lifecycle cleanup). */
export function evictWorktree(worktreePath: string): void {
  deltaMemo.evict(worktreePath);
  graphCache.delete(worktreePath);
}

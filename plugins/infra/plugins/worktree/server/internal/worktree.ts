import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { attemptBranchName } from "../../core";
import { withWorktreeMutateSlot } from "./mutate-gate";
import {
  beginInAppRemoval,
  finishInAppRemoval,
  setRemovalBranch,
  type InAppRemovalRecord,
} from "./removal-seam";

let cachedRepoRoot: string | null = null;

// Every git subprocess in this file is bounded, because every one of them can be
// reached while the host-wide `worktree-mutate` flock is held: an unbounded child
// there does not hang one caller, it stops worktree checkouts on every backend on
// the machine (the 2026-08-17 outage). The values are ~100× the measured p50 of
// each command, loose enough that only a genuinely wedged child trips them.
//
// Independently of the timeouts, moving off raw `Bun.spawn` is itself the fix for
// the observed wedge: the old code spawned with `{stdout: "pipe", stderr: "pipe"}`
// and then awaited `.exited` WITHOUT EVER READING STDOUT. A child writing more than
// the ~64 KB pipe buffer to an undrained fd blocks forever — a plain deadlock, no
// bug required — and it is also the exact bun 1.3.13 exit-during-stream-pull shape.
// `spawnCaptured` redirects to numeric temp-file fds, which removes both outright.
// THESE ARE WEDGE-BREAKERS, NOT LATENCY POLICE, and they are deliberately far
// looser than "a bit above p99". Every one of them is consumed by a `throw`, and
// a false positive is expensive in both directions: `worktreeListPaths` treats a
// failure as fatal precisely because absence must never be read as evidence
// (see its docblock), and a false timeout on `worktree add` triggers the
// destructive partial-checkout cleanup below. Being late to break a real wedge
// costs one more hourly tick; firing early costs a failed checkout or removal.
//
// Calibrated against measurement, not intuition. `git worktree list --porcelain`
// on this repo (111 worktrees, 76 GB of checkouts) samples at p50 94 ms / p99
// 302 ms / max 585 ms under host load — and a 10 s bound STILL false-fired in a
// real `./singularity check` run, where `ensureMainWorktreeRoot()` is called from
// every parallel type-check worker at once on a saturated box. Starvation, not
// slowness, is what these commands actually suffer, and starvation is unbounded
// by the p99 of an idle box. So each value is ~2-3 orders of magnitude above p50.
const LIST_TIMEOUT_MS = 60_000; // ~640x the 94 ms p50
const ADD_TIMEOUT_MS = 600_000; // ~160x the 3.8 s p50; its false positive is the destructive one
const PRUNE_TIMEOUT_MS = 60_000; // metadata-only, same starvation exposure as list
const REMOVE_TIMEOUT_MS = 300_000; // ~250x the 1.2 s p50; still frees the flock inside one hourly tick
const LOCK_TIMEOUT_MS = 60_000; // metadata-only, same starvation exposure as prune
const MISE_TRUST_TIMEOUT_MS = 30_000;

// A git subprocess in this file blew its bound and was KILLED. Its own type,
// not a bare Error, because the distinction is load-bearing for callers: a
// killed child here means a wedge — very likely one that sat on a host-wide
// `worktree-mutate` slot while it hung (the 2026-08-17 outage shape) — whereas a
// nonzero exit is an ordinary git failure. The reaper files a different report
// for each, and the only alternative way to tell them apart would be to match on
// the message text, which is the weakest rung of enforcement for something the
// throw site already knows for certain.
//
// `worktreePath` is the worktree the command was operating on where there is
// one; `worktreeListPaths` reads repo-wide metadata and has none.
export class WorktreeGitTimeoutError extends Error {
  readonly command: string;
  readonly timeoutMs: number;
  readonly worktreePath: string | undefined;
  constructor(opts: {
    message: string;
    command: string;
    timeoutMs: number;
    worktreePath?: string;
  }) {
    super(opts.message);
    this.name = "WorktreeGitTimeoutError";
    this.command = opts.command;
    this.timeoutMs = opts.timeoutMs;
    this.worktreePath = opts.worktreePath;
  }
}

// The absolute paths git currently tracks as worktrees, in git's own order (the
// main worktree first). One parser for every `worktree list --porcelain` reader,
// so "which paths does git know about" is answered the same way everywhere.
//
// Throws on a nonzero exit rather than reporting an empty list: callers read
// ABSENCE from this list as meaning, so a git failure that degraded to `[]`
// would read as "git tracks nothing" — which in removeWorktree selects the
// recursive-delete branch. A failure here must never be mistaken for evidence.
//
// The tightest bound in the file, because `removeWorktreeUnlogged` calls it from
// INSIDE the mutate gate: a wedge here holds one of three host-wide slots while
// doing nothing but reading metadata.
async function worktreeListPaths(argv: string[]): Promise<string[]> {
  const r = await spawnCaptured(argv, { timeoutMs: LIST_TIMEOUT_MS });
  if (r.timedOut) {
    throw new WorktreeGitTimeoutError({
      message:
        `git worktree list did not finish within ${LIST_TIMEOUT_MS} ms and was killed ` +
        `(it may run while a host-wide worktree-mutate slot is held): ${argv.join(" ")}`,
      command: argv.join(" "),
      timeoutMs: LIST_TIMEOUT_MS,
    });
  }
  if (r.exitCode !== 0) {
    throw new Error(
      `git worktree list failed (exit ${r.exitCode}): ${r.stderr.trim() || "<no stderr>"}`,
    );
  }
  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length).trim());
}

// The main worktree root (parent of all `.claude/worktrees/*`), not the
// current worktree — `git rev-parse --show-toplevel` would return the latter
// when the server runs inside a worktree.
export async function ensureMainWorktreeRoot(): Promise<string> {
  if (cachedRepoRoot) return cachedRepoRoot;
  const [mainPath] = await worktreeListPaths([
    GIT,
    "worktree",
    "list",
    "--porcelain",
  ]);
  if (!mainPath) throw new Error("Could not determine main worktree root");
  cachedRepoRoot = mainPath;
  return cachedRepoRoot;
}

// The parent dir every agent worktree lives directly under. The single
// definition that both `worktreePathFor` (construction) and
// `isCanonicalWorktreePath` (validation) derive from, so the two can never
// disagree about where worktrees live.
export function gitWorktreesDir(repoRoot: string): string {
  return join(repoRoot, ".claude", "worktrees");
}

export async function worktreePathFor(id: string): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(gitWorktreesDir(root), id);
}

// The inverse of `worktreePathFor`: a real agent worktree always lives as a
// DIRECT child of `<root>/.claude/worktrees/`. Anything else (the main repo
// root, /tmp, a hand-edited path) is non-canonical — it is not a worktree this
// system created, so it must never be adopted as an attempt nor handed to
// `git worktree remove`.
export function isCanonicalWorktreePath(
  path: string,
  repoRoot: string,
): boolean {
  return dirname(path) === gitWorktreesDir(repoRoot);
}

// Stamped into `.git/worktrees/<name>/locked`, so `git worktree list` says who
// locked it and why rather than leaving a bare marker for a human to explain.
const WORKTREE_LOCK_REASON = "singularity agent worktree";

/**
 * Lock the checkout so an outside sweep cannot remove it.
 *
 * `<repo>/.claude/worktrees/` is Claude Code's OWN worktree directory, not ours:
 * it sweeps that path periodically and removes any worktree holding no work —
 * which is every one of ours the moment its branch merges. That is the observed
 * cause of the `worktree-removed-externally` reports (16 checkouts, every one
 * fully merged, all deleted by a git-aware remover on a cadence no job of ours
 * runs on).
 *
 * A lock is the documented opt-out: the sweep skips a locked worktree and never
 * releases a lock it did not set. So every checkout we create stays locked for
 * its whole life, and `removeWorktree` is the only thing that unlocks it.
 *
 * Idempotent: re-locking an already-locked worktree exits 128 with "is already
 * locked", which IS the state the caller asked for, so it counts as success.
 * That is what lets `setupWorktree` re-assert the lock on every call and
 * self-heal a checkout created before this existed.
 *
 * Any other failure is logged, not thrown — the same trade the prune calls in
 * this file make, and for a sharper reason: this runs AFTER a successful
 * checkout, so throwing would fail `setupWorktree`, and the durable job's retry
 * would take the `existsSync` early return straight back to the same failing
 * lock. An agent that never starts is a worse outcome than an unlocked
 * worktree, which is merely the exposure we have lived with until now.
 */
async function ensureWorktreeLocked(
  repoRoot: string,
  wtPath: string,
): Promise<void> {
  const r = await spawnCaptured(
    [
      GIT,
      "-C",
      repoRoot,
      "worktree",
      "lock",
      wtPath,
      "--reason",
      WORKTREE_LOCK_REASON,
    ],
    { timeoutMs: LOCK_TIMEOUT_MS },
  );
  if (r.exitCode === 0 || r.stderr.includes("is already locked")) return;
  console.warn(
    `[worktree] could not lock ${wtPath} ` +
      `(${r.timedOut ? `timed out after ${LOCK_TIMEOUT_MS} ms` : `exit ${r.exitCode}`}): ` +
      `${r.stderr.trim() || "<no stderr>"} — the checkout is exposed to Claude Code's worktree sweep`,
  );
}

/**
 * Release our own lock so the removal that follows can proceed.
 *
 * Mandatory, not tidiness: git refuses to remove a locked worktree even with
 * `--force`, and `git worktree prune` SKIPS a locked registration whose
 * directory is already gone — silently, forever. Without this, locking would
 * trade an external-deletion problem for a leaked-registration one.
 *
 * Deliberately NOT `remove -f -f`, which would bulldoze any lock including one a
 * human set by hand. Unlocking exactly what we locked keeps a lock we could not
 * release loud: the `remove` below then fails and names the lock, rather than
 * this call quietly deciding the lock did not matter.
 */
async function unlockWorktreeForRemoval(
  repoRoot: string,
  wtPath: string,
): Promise<void> {
  const r = await spawnCaptured(
    [GIT, "-C", repoRoot, "worktree", "unlock", wtPath],
    { timeoutMs: LOCK_TIMEOUT_MS },
  );
  // "is not locked" is the desired end state, not a failure.
  if (r.exitCode === 0 || r.stderr.includes("is not locked")) return;
  console.warn(
    `[worktree] could not unlock ${wtPath} before removal ` +
      `(${r.timedOut ? `timed out after ${LOCK_TIMEOUT_MS} ms` : `exit ${r.exitCode}`}): ` +
      `${r.stderr.trim() || "<no stderr>"}`,
  );
}

export async function setupWorktree(id: string, wtPath: string): Promise<void> {
  const repoRoot = await ensureMainWorktreeRoot();
  // Idempotent: an already-present worktree dir means the checkout already
  // landed, so a durable-job retry (or a caller reusing an existing worktree) is
  // a no-op. `worktreePathFor` derives the path purely from the id, so the dir's
  // existence is an authoritative "already set up" signal.
  //
  // The lock is re-asserted rather than skipped: this is the path every reused
  // and every pre-lock worktree takes, so making it the place the lock is
  // guaranteed means a checkout cannot stay unlocked just because it predates
  // this code or something released its lock.
  if (existsSync(wtPath)) {
    await ensureWorktreeLocked(repoRoot, wtPath);
    return;
  }

  const branch = attemptBranchName(id);
  // Gate ONLY the heavy checkout subprocess host-wide (the 77 MB / 8385-file disk
  // offender). The idempotent existsSync early-return and `mise trust` stay
  // outside the gate — they are cheap and must not hold a slot.
  await withWorktreeMutateSlot(async () => {
    // Demoted (`background: true` applies backgroundArgv/darwinbg): the checkout
    // runs in the deferred spawn job — always background work relative to the
    // interactive backends.
    const r = await spawnCaptured(
      [GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"],
      { background: true, timeoutMs: ADD_TIMEOUT_MS },
    );
    if (r.timedOut) {
      // MANDATORY companion to the timeout, not defensive tidiness. This function
      // opens with `if (existsSync(wtPath)) return;` — so a checkout we killed
      // half-way leaves a partial tree that the durable job's next retry reads as
      // "already set up", handing a HALF-POPULATED worktree to `runtime.create`.
      // That is strictly worse than the hang the timeout replaces, so the partial
      // tree must not outlive the kill.
      //
      // Cleaned up INSIDE the same gate hold, and deliberately NOT via
      // `removeWorktree`: that re-enters `withWorktreeMutateSlot` and would take a
      // second of the three host-wide slots while we are still holding one.
      //
      // Known gap, accepted: SIGTERM reaches only the direct child. `taskpolicy`
      // execs, so the kill lands on git itself, but git's forked `checkout` /
      // `read-tree` grandchildren survive and may write into the tree we are about
      // to remove. `rm -rf` is idempotent and anything they recreate is an
      // unregistered leftover the reaper's next tick removes.
      await rm(wtPath, { recursive: true, force: true });
      const pruned = await spawnCaptured(
        [GIT, "-C", repoRoot, "worktree", "prune"],
        {
          background: true,
          timeoutMs: PRUNE_TIMEOUT_MS,
        },
      );
      if (pruned.timedOut || pruned.exitCode !== 0) {
        console.warn(
          `[worktree] prune after a timed-out 'worktree add' for ${id} did not succeed ` +
            `(${pruned.timedOut ? "timed out" : `exit ${pruned.exitCode}`}): ` +
            `${pruned.stderr.trim() || "<no stderr>"}`,
        );
      }
      throw new WorktreeGitTimeoutError({
        message:
          `git worktree add for ${id} did not finish within ${ADD_TIMEOUT_MS} ms and was ` +
          `killed; the partial checkout at ${wtPath} was removed so the retry starts clean`,
        command: `${GIT} -C ${repoRoot} worktree add -b ${branch} ${wtPath} main`,
        timeoutMs: ADD_TIMEOUT_MS,
        worktreePath: wtPath,
      });
    }
    // Fail loudly on a genuine checkout failure so the durable spawn job retries
    // instead of handing `runtime.create` a nonexistent worktree dir (the latent
    // swallowed-failure bug this replaces: the old code awaited `.exited` and
    // ignored `exitCode`). A nonzero exit where the dir now exists is a benign
    // "already exists" race (a concurrent creator won) — treat it as success.
    if (r.exitCode !== 0 && !existsSync(wtPath)) {
      throw new Error(
        `git worktree add for ${id} failed (exit ${r.exitCode}): ${r.stderr.trim() || "<no stderr>"}`,
      );
    }
    // Locked inside the same gate hold as the checkout that created it: the
    // window between "the directory exists" and "the directory is protected" is
    // exactly the window an outside sweep can take it, so it is closed here
    // rather than after the gate is released.
    await ensureWorktreeLocked(repoRoot, wtPath);
  });
  // Trust the mise config so agents can run build commands without hitting
  // "config file is not trusted" errors. No-op if mise is not installed.
  //
  // Best-effort: mise may not be installed at all, and a missing trust only costs
  // the agent one prompt later. What the empty catch swallows is now bounded — with
  // `timeoutMs` the only thing it can hide is a genuine "mise is absent or broken"
  // throw, never a child hanging forever behind an empty catch.
  try {
    await spawnCaptured(["mise", "trust", `${wtPath}/mise.toml`], {
      timeoutMs: MISE_TRUST_TIMEOUT_MS,
    });
    // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {}
}

export async function removeWorktree(wtPath: string): Promise<void> {
  const repoRoot = await ensureMainWorktreeRoot();
  // Attribution, recorded BEFORE anything destructive runs and before we queue
  // on the mutate gate. Two reasons for the ordering: a removal that dies
  // mid-flight is still attributable, and the audit watcher can observe the
  // directory vanishing while this call is still in progress — a record written
  // afterwards would lose that race and read as an external deletion.
  //
  // Deliberately unconditional: the whole point is that EVERY in-app removal
  // leaves a line, so a disappearance with no line is proof of an outside actor
  // rather than something to reconstruct from timestamps later.
  const removal = beginInAppRemoval(wtPath);
  try {
    await removeWorktreeUnlogged(wtPath, repoRoot, removal);
  } catch (err) {
    finishInAppRemoval(removal, { ok: false, error: String(err) });
    throw err;
  }
  finishInAppRemoval(removal, { ok: true });
}

async function removeWorktreeUnlogged(
  wtPath: string,
  repoRoot: string,
  removal: InAppRemovalRecord,
): Promise<void> {
  // Gate the heavy full-tree `rm` host-wide (~1.2 s / 77 MB), the same disk offender
  // as `add` — one shared budget bounds add+remove contention across all callers.
  await withWorktreeMutateSlot(async () => {
    // A dir can outlive its git registration (a `git worktree prune` after the dir
    // was made unreachable, an interrupted removal, a repo re-clone). `git worktree
    // remove` fails hard on such a dir — "is not a working tree" — so the strategy
    // is chosen from an explicit registration check rather than discovered from a
    // nonzero exit, which would be indistinguishable from a real failure.
    //
    // Read INSIDE the gate: registration is exactly the state a concurrent
    // add/remove mutates, so checking it outside would race a holder of the slot
    // and pick a strategy for a repo state that no longer holds.
    const registered = (
      await worktreeListPaths([
        GIT,
        "-C",
        repoRoot,
        "worktree",
        "list",
        "--porcelain",
      ])
    ).includes(wtPath);
    if (!registered) {
      // Unregistered leftover: git will not touch it, so the dir itself is the
      // only thing left to reclaim. Re-assert the canonical-path invariant here
      // rather than trusting the caller — this branch is a recursive delete, and
      // the guard must sit at the syscall, not one frame above it.
      if (!isCanonicalWorktreePath(wtPath, repoRoot)) {
        throw new Error(
          `refusing to remove non-canonical worktree path ${wtPath} (not a direct child of ${gitWorktreesDir(repoRoot)})`,
        );
      }
      setRemovalBranch(removal, "rm-and-prune");
      await rm(wtPath, { recursive: true, force: true });
      // Drop any stale administrative entry left behind in .git/worktrees.
      //
      // The outcome is now READ — the old code awaited `.exited` and never looked
      // at `exitCode`, so a prune that failed was indistinguishable from one that
      // worked. It is logged rather than thrown on purpose: the destructive `rm`
      // above already succeeded, so failing the call here would report a completed
      // removal as a failure and, in the reaper, lose the work every retry redoes.
      // A stale admin entry is harmless and the next prune clears it.
      const pruned = await spawnCaptured(
        [GIT, "-C", repoRoot, "worktree", "prune"],
        {
          background: true,
          timeoutMs: PRUNE_TIMEOUT_MS,
        },
      );
      if (pruned.timedOut || pruned.exitCode !== 0) {
        console.warn(
          `[worktree] 'worktree prune' after removing ${wtPath} did not succeed ` +
            `(${pruned.timedOut ? `timed out after ${PRUNE_TIMEOUT_MS} ms` : `exit ${pruned.exitCode}`}): ` +
            `${pruned.stderr.trim() || "<no stderr>"}`,
        );
      }
      return;
    }
    // Our own lock, released immediately before the removal that needs it gone.
    // Only on this branch: an unregistered leftover has no registration to hold
    // a lock, and `git worktree unlock` on one fails with "is not a working
    // tree" — a confusing warning for a state that cannot be locked.
    await unlockWorktreeForRemoval(repoRoot, wtPath);
    setRemovalBranch(removal, "git-worktree-remove");
    // Demoted (`background: true` applies backgroundArgv/darwinbg): removal is
    // cleanup/reap work, never interactive.
    //
    // This is the site of the 2026-08-17 outage: it holds a host-wide
    // `worktree-mutate` slot, and with no bound a wedged git here blocked worktree
    // checkouts on every backend on the machine until someone noticed. 120 s is
    // ~100× the 1.2 s p50 — loose enough to never fire on real work, short enough
    // that a wedged hourly reap frees the flock within its own tick.
    const r = await spawnCaptured(
      [GIT, "-C", repoRoot, "worktree", "remove", wtPath, "--force"],
      { background: true, timeoutMs: REMOVE_TIMEOUT_MS },
    );
    if (r.timedOut) {
      throw new WorktreeGitTimeoutError({
        message:
          `git worktree remove for ${wtPath} did not finish within ${REMOVE_TIMEOUT_MS} ms ` +
          `and was killed; the host-wide worktree-mutate slot is released and the next ` +
          `sweep retries`,
        command: `${GIT} -C ${repoRoot} worktree remove ${wtPath} --force`,
        timeoutMs: REMOVE_TIMEOUT_MS,
        worktreePath: wtPath,
      });
    }
    if (r.exitCode !== 0) {
      throw new Error(`git worktree remove failed: ${r.stderr}`);
    }
  });
}

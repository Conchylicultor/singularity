import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { withWorktreeMutateSlot } from "./mutate-gate";
import {
  beginInAppRemoval,
  finishInAppRemoval,
  setRemovalBranch,
  type InAppRemovalRecord,
} from "./removal-seam";

let cachedRepoRoot: string | null = null;

// The absolute paths git currently tracks as worktrees, in git's own order (the
// main worktree first). One parser for every `worktree list --porcelain` reader,
// so "which paths does git know about" is answered the same way everywhere.
//
// Throws on a nonzero exit rather than reporting an empty list: callers read
// ABSENCE from this list as meaning, so a git failure that degraded to `[]`
// would read as "git tracks nothing" — which in removeWorktree selects the
// recursive-delete branch. A failure here must never be mistaken for evidence.
async function worktreeListPaths(argv: string[]): Promise<string[]> {
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const [text, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(
      `git worktree list failed (exit ${proc.exitCode}): ${stderr.trim() || "<no stderr>"}`,
    );
  }
  return text
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

export async function setupWorktree(id: string, wtPath: string): Promise<void> {
  // Idempotent: an already-present worktree dir means the checkout already
  // landed, so a durable-job retry (or a caller reusing an existing worktree) is
  // a no-op. `worktreePathFor` derives the path purely from the id, so the dir's
  // existence is an authoritative "already set up" signal.
  if (existsSync(wtPath)) return;

  const repoRoot = await ensureMainWorktreeRoot();
  const branch = `claude-web/${id}`;
  // Gate ONLY the heavy checkout subprocess host-wide (the 77 MB / 8385-file disk
  // offender). The idempotent existsSync early-return and `mise trust` stay
  // outside the gate — they are cheap and must not hold a slot.
  await withWorktreeMutateSlot(async () => {
    // Demoted (darwinbg): the checkout runs in the deferred spawn job — always
    // background work relative to the interactive backends.
    const proc = Bun.spawn(
      backgroundArgv([
        GIT,
        "-C",
        repoRoot,
        "worktree",
        "add",
        "-b",
        branch,
        wtPath,
        "main",
      ]),
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stderr, exit] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    // Fail loudly on a genuine checkout failure so the durable spawn job retries
    // instead of handing `runtime.create` a nonexistent worktree dir (the latent
    // swallowed-failure bug this replaces: the old code awaited `.exited` and
    // ignored `exitCode`). A nonzero exit where the dir now exists is a benign
    // "already exists" race (a concurrent creator won) — treat it as success.
    if (exit !== 0 && !existsSync(wtPath)) {
      throw new Error(
        `git worktree add for ${id} failed (exit ${exit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
  });
  // Trust the mise config so agents can run build commands without hitting
  // "config file is not trusted" errors. No-op if mise is not installed.
  try {
    await Bun.spawn(["mise", "trust", `${wtPath}/mise.toml`], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
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
      await Bun.spawn(
        backgroundArgv([GIT, "-C", repoRoot, "worktree", "prune"]),
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      ).exited;
      return;
    }
    setRemovalBranch(removal, "git-worktree-remove");
    // Demoted (darwinbg): removal is cleanup/reap work, never interactive.
    const proc = Bun.spawn(
      backgroundArgv([
        GIT,
        "-C",
        repoRoot,
        "worktree",
        "remove",
        wtPath,
        "--force",
      ]),
      { stdout: "pipe", stderr: "pipe" },
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`git worktree remove failed: ${err}`);
    }
  });
}

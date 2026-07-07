import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { withWorktreeMutateSlot } from "./mutate-gate";

let cachedRepoRoot: string | null = null;

// The main worktree root (parent of all `.claude/worktrees/*`), not the
// current worktree — `git rev-parse --show-toplevel` would return the latter
// when the server runs inside a worktree.
export async function ensureMainWorktreeRoot(): Promise<string> {
  if (cachedRepoRoot) return cachedRepoRoot;
  const proc = Bun.spawn([GIT, "worktree", "list", "--porcelain"], {
    stdout: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const firstLine = text.split("\n").find((l) => l.startsWith("worktree "));
  if (!firstLine) throw new Error("Could not determine main worktree root");
  cachedRepoRoot = firstLine.slice("worktree ".length).trim();
  return cachedRepoRoot;
}

export async function worktreePathFor(id: string): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return `${root}/.claude/worktrees/${id}`;
}

// The inverse of `worktreePathFor`: a real agent worktree always lives as a
// DIRECT child of `<root>/.claude/worktrees/`. Anything else (the main repo
// root, /tmp, a hand-edited path) is non-canonical — it is not a worktree this
// system created, so it must never be adopted as an attempt nor handed to
// `git worktree remove`.
export function isCanonicalWorktreePath(path: string, repoRoot: string): boolean {
  return dirname(path) === join(repoRoot, ".claude", "worktrees");
}

// Seed the worktree's incremental TypeScript caches from main so the first
// build type-checks only its own diff instead of the whole tree. One file per
// tsc target; `.tsbuildinfo` embeds absolute source paths, so rewrite the
// embedded absolute paths to the worktree root. A version/options mismatch just
// makes tsc fall back to a full check — best-effort, never wrong.
async function copyTsBuildInfoToWorktree(repoRoot: string, wtPath: string): Promise<void> {
  const sourceDir = join(repoRoot, ".cache", "tsbuildinfo");
  if (!existsSync(sourceDir)) return;

  const destDir = join(wtPath, ".cache", "tsbuildinfo");
  await mkdir(destDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    if (!entry.endsWith(".tsbuildinfo")) continue;
    const raw = await Bun.file(join(sourceDir, entry)).text();
    const rewritten = raw.split(repoRoot).join(wtPath);
    await Bun.write(join(destDir, entry), rewritten);
  }
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
  // offender). The idempotent existsSync early-return, tsbuildinfo copy, and `mise
  // trust` stay outside the gate — they are cheap and must not hold a slot.
  await withWorktreeMutateSlot(async () => {
    // Demoted (darwinbg): the checkout runs in the deferred spawn job — always
    // background work relative to the interactive backends.
    const proc = Bun.spawn(
      backgroundArgv([GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"]),
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
  try {
    await copyTsBuildInfoToWorktree(repoRoot, wtPath);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {}
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
  // Gate the heavy full-tree `rm` host-wide (~1.2 s / 77 MB), the same disk offender
  // as `add` — one shared budget bounds add+remove contention across all callers.
  await withWorktreeMutateSlot(async () => {
    // Demoted (darwinbg): removal is cleanup/reap work, never interactive.
    const proc = Bun.spawn(
      backgroundArgv([GIT, "-C", repoRoot, "worktree", "remove", wtPath, "--force"]),
      { stdout: "pipe", stderr: "pipe" },
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`git worktree remove failed: ${err}`);
    }
  });
}

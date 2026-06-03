import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// A per-worktree, crash-safe marker for a long-running operation (build, push)
// that will eventually finish and resume the agent. The conversation status
// poller treats a tmux pane in the CLI "shell" state as `working` ONLY while one
// of these markers is live for its worktree — every other never-ending
// background shell (dev server, `tail -f`, a build whose completion marker never
// matched) falls through to the idle/waiting reading instead of looking busy
// forever. Markers are keyed on the worktree directory basename, which the
// writers (`./singularity build` / `push`, via `basename(getWorktreeRoot())`)
// and the reader (runtime-tmux, via `basename(worktreePath)`) all agree on.
export type WorktreeOp = "build" | "push";

function opsDir(slug: string): string {
  return join(SINGULARITY_DIR, "worktrees", slug, "ops");
}

function opFile(slug: string, op: WorktreeOp): string {
  return join(opsDir(slug), `${op}.json`);
}

// Mirrors isPidAlive in @plugins/build/server: signal 0 probes existence without
// delivering anything. EPERM means the pid is alive but owned by another user —
// still alive for our purposes.
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function markWorktreeOpStart(slug: string, op: WorktreeOp): void {
  mkdirSync(opsDir(slug), { recursive: true });
  writeFileSync(
    opFile(slug, op),
    JSON.stringify({ op, pid: process.pid, startedAt: new Date().toISOString() }),
  );
}

export function clearWorktreeOp(slug: string, op: WorktreeOp): void {
  rmSync(opFile(slug, op), { force: true });
}

// True iff any op marker for this worktree names a live pid. Reaps dead or
// unparseable markers as it scans, so a SIGKILLed build/push (which can't run
// its own cleanup) self-heals on the next read.
export function isWorktreeOpActive(slug: string): boolean {
  let files: string[];
  try {
    files = readdirSync(opsDir(slug));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  let active = false;
  for (const f of files) {
    const path = join(opsDir(slug), f);
    let pid: unknown;
    try {
      pid = (JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown }).pid;
    } catch {
      // Unreadable/garbage marker — reclaim it.
      rmSync(path, { force: true });
      continue;
    }
    if (typeof pid === "number" && isPidAlive(pid)) active = true;
    else rmSync(path, { force: true });
  }
  return active;
}

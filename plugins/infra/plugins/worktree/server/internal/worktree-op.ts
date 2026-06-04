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

// A push is written up-front in the "waiting-for-lock" phase (before it requests
// the global push lock) and flipped to "running" the moment the lock is granted,
// so a push queued behind another reads as genuinely-queued rather than running.
// Builds only ever write "running" (the default); the field is generic so a
// build-lock-wait phase can be added later with no schema change.
export type WorktreeOpPhase = "waiting-for-lock" | "running";

export interface WorktreeOpInfo {
  slug: string;
  op: WorktreeOp;
  startedAt: string;
  phase: WorktreeOpPhase;
}

// The root holding every worktree's per-worktree singularity state (the `ops/`
// markers live under `<root>/<slug>/ops/`). Exposed so consumers can watch it.
export function worktreesDir(): string {
  return join(SINGULARITY_DIR, "worktrees");
}

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

export function markWorktreeOpStart(
  slug: string,
  op: WorktreeOp,
  phase: WorktreeOpPhase = "running",
): void {
  mkdirSync(opsDir(slug), { recursive: true });
  writeFileSync(
    opFile(slug, op),
    JSON.stringify({ op, pid: process.pid, startedAt: new Date().toISOString(), phase }),
  );
}

// Rewrite an existing marker's phase, preserving pid/startedAt. No-op if the
// marker is gone (op already finished and cleared).
export function setWorktreeOpPhase(slug: string, op: WorktreeOp, phase: WorktreeOpPhase): void {
  const path = opFile(slug, op);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  writeFileSync(path, JSON.stringify({ ...parsed, phase }));
}

export function clearWorktreeOp(slug: string, op: WorktreeOp): void {
  rmSync(opFile(slug, op), { force: true });
}

// Parse one marker file, reaping it if dead or unparseable, so a SIGKILLed
// build/push (which can't run its own cleanup) self-heals on the next read.
// Returns the live marker's data, or null if the marker was reclaimed.
function readLiveMarker(slug: string, path: string): WorktreeOpInfo | null {
  let parsed: { op?: unknown; pid?: unknown; startedAt?: unknown; phase?: unknown };
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as typeof parsed;
  } catch {
    // Unreadable/garbage marker — reclaim it.
    rmSync(path, { force: true });
    return null;
  }
  if (typeof parsed.pid !== "number" || !isPidAlive(parsed.pid)) {
    rmSync(path, { force: true });
    return null;
  }
  return {
    slug,
    op: parsed.op === "push" ? "push" : "build",
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date(0).toISOString(),
    // Back-compat: markers written before the phase field default to "running".
    phase: parsed.phase === "waiting-for-lock" ? "waiting-for-lock" : "running",
  };
}

// True iff any op marker for this worktree names a live pid. Reaps dead or
// unparseable markers as it scans.
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
    if (readLiveMarker(slug, join(opsDir(slug), f))) active = true;
  }
  return active;
}

// Every live op marker across all worktrees, parsed into WorktreeOpInfo. Reaps
// dead/garbage markers as it scans, like isWorktreeOpActive.
export function listActiveWorktreeOps(): WorktreeOpInfo[] {
  let slugs: string[];
  try {
    slugs = readdirSync(worktreesDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: WorktreeOpInfo[] = [];
  for (const slug of slugs) {
    let files: string[];
    try {
      files = readdirSync(opsDir(slug));
    } catch {
      continue; // Not a worktree-with-ops dir; skip.
    }
    for (const f of files) {
      const info = readLiveMarker(slug, join(opsDir(slug), f));
      if (info) out.push(info);
    }
  }
  return out;
}

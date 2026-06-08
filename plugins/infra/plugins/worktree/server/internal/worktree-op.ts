import {
  closeSync,
  type Dirent,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { dlopen } from "bun:ffi";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// A per-worktree, crash-safe marker for a long-running operation (build, push,
// check) that will eventually finish and resume the agent. The conversation
// status poller treats a tmux pane in the CLI "shell" state as `working` ONLY
// while one of these markers is live for its worktree — every other never-ending
// background shell (dev server, `tail -f`, a build whose completion marker never
// matched) falls through to the idle/waiting reading instead of looking busy
// forever. Markers are keyed on the worktree directory basename, which the
// writers (`./singularity build` / `push` / `check`, via
// `basename(getWorktreeRoot())`) and the reader (runtime-tmux, via
// `basename(worktreePath)`) all agree on.
export type WorktreeOp = "build" | "push" | "check";

// The closed set of known op types, for validating a marker's self-reported op
// when reading it back (a marker written by an older/garbage writer that names
// an unknown op falls back to "build").
const KNOWN_OPS: readonly WorktreeOp[] = ["build", "push", "check"];

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
  // When a push is actually running, the instant the push lock was granted
  // (from the holder file's `acquiredAt`) — i.e. when waiting ended and pushing
  // began. null for waiting pushes and builds. Derived, never stored in the
  // marker: see derivePushPhases. Lets the UI clock push time separately from
  // the wait spent queued for the lock.
  runningAt: string | null;
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
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
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
  } catch (err) {
    // Expected: fs errors (ENOENT, EACCES, etc.) or garbled JSON (SyntaxError).
    if ((err as NodeJS.ErrnoException).code == null && !(err instanceof SyntaxError)) throw err;
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
    op: KNOWN_OPS.includes(parsed.op as WorktreeOp) ? (parsed.op as WorktreeOp) : "build",
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date(0).toISOString(),
    // Back-compat: markers written before the phase field default to "running".
    phase: parsed.phase === "waiting-for-lock" ? "waiting-for-lock" : "running",
    // Filled in by derivePushPhases from the authoritative holder file; the
    // marker itself never carries it.
    runningAt: null,
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
  let entries: Dirent[];
  try {
    entries = readdirSync(worktreesDir(), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: WorktreeOpInfo[] = [];
  for (const entry of entries) {
    // worktreesDir() holds both worktree directories AND per-worktree gateway
    // registration files (`<slug>.json`); only directories carry an ops/ subdir,
    // so descending into a `.json` file would throw ENOTDIR. Skip non-dirs.
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    let files: string[];
    try {
      files = readdirSync(opsDir(slug));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue; // Not a worktree-with-ops dir; skip.
    }
    for (const f of files) {
      const info = readLiveMarker(slug, join(opsDir(slug), f));
      if (info) out.push(info);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Push-lock ownership: one source of truth
// ---------------------------------------------------------------------------
//
// A push marker's stored `phase` is a per-process *self-assertion* and cannot be
// trusted to say who holds the global push lock: a hard-killed push (SIGKILL/OOM)
// leaves a stale "running" marker, and pid-liveness reaping is defeated by PID
// reuse — so two markers can read "running" at once, or none can. The kernel
// flock on `push.lock` (held only by the CLI push process, auto-released on death)
// is the ONLY crash-safe, PID-reuse-proof truth for "is a push running". This
// module derives each push marker's displayed phase from two authoritative inputs:
//
//   - existence of a running push  → the kernel flock probe (`pushLockHeld`)
//   - identity of the holder       → a single global holder file (one file ⇒ at
//                                     most one running slug ⇒ two-running is
//                                     structurally impossible)
//
// The holder file is written by whoever holds the flock (in the CLI's
// onLockAcquired) and removed on release; the server only reads it.

// MUST match `PUSH_LOCK_PATH` in the CLI push command — both flock the same file.
export const PUSH_LOCK_PATH = join(SINGULARITY_DIR, "push.lock");
const PUSH_HOLDER_PATH = join(SINGULARITY_DIR, "push-holder.json");

export interface PushHolder {
  slug: string;
  pid: number;
  pushId: string;
  acquiredAt: string;
}

// Lazily dlopen libc's flock so this module stays importable in non-FFI contexts
// (it is only ever exercised under Bun on the server / CLI).
let flockFn: ((fd: number, op: number) => number) | null = null;
function flock(fd: number, op: number): number {
  if (!flockFn) {
    const { symbols } = dlopen(
      process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
      { flock: { args: ["i32", "i32"], returns: "i32" } },
    );
    flockFn = symbols.flock as (fd: number, op: number) => number;
  }
  return flockFn(fd, op);
}
const LOCK_EX = 2;
const LOCK_NB = 4;

// True iff some process currently holds the push flock. Crash-proof and
// PID-reuse-proof: asks the kernel directly. Probes non-blocking and releases
// immediately on success (open in append mode so we never truncate the lock
// file the CLI may be holding). When the lock is held the probe fails fast
// without acquiring, so it never disturbs the real holder.
export function pushLockHeld(lockPath: string = PUSH_LOCK_PATH): boolean {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  let fd: number;
  try {
    fd = openSync(lockPath, "a");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
  try {
    // Non-zero return ⇒ EWOULDBLOCK ⇒ someone else holds it.
    return flock(fd, LOCK_EX | LOCK_NB) !== 0;
  } finally {
    closeSync(fd); // releases the flock if we happened to acquire it
  }
}

// Atomically publish the holder identity (temp + rename) so a reader never sees
// a torn write. Called by the flock holder the instant the lock is granted. The
// path defaults to the real holder file; tests pass a temp path.
export function writePushHolder(holder: PushHolder, path: string = PUSH_HOLDER_PATH): void {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(holder));
  renameSync(tmp, path);
}

export function readPushHolder(path: string = PUSH_HOLDER_PATH): PushHolder | null {
  let parsed: Partial<PushHolder>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PushHolder>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null && !(err instanceof SyntaxError)) throw err;
    return null; // absent or unparseable
  }
  if (
    typeof parsed.slug !== "string" ||
    typeof parsed.pid !== "number" ||
    typeof parsed.pushId !== "string"
  ) {
    return null;
  }
  return {
    slug: parsed.slug,
    pid: parsed.pid,
    pushId: parsed.pushId,
    acquiredAt: typeof parsed.acquiredAt === "string" ? parsed.acquiredAt : new Date(0).toISOString(),
  };
}

// Remove the holder file ONLY if it still names this push — a late-dying waiter
// (or a previous holder whose exit handler fires after the next holder took
// over) must not delete the current holder's file.
export function clearPushHolder(pushId: string, path: string = PUSH_HOLDER_PATH): void {
  const holder = readPushHolder(path);
  if (holder && holder.pushId !== pushId) return;
  rmSync(path, { force: true });
}

export interface DerivePushDeps {
  isAlive: (pid: number) => boolean;
  lockHeld: () => boolean;
}

// Pure: given the live op markers and the current holder file, return the markers
// with each PUSH marker's phase set to the DERIVED truth. Builds pass through
// untouched (they never contend on the push lock). At most one slug can be
// "running" — the one the single holder file names, and only when its pid is
// alive AND the kernel confirms the lock is genuinely held (the only check that
// survives PID reuse). Every other push is "waiting-for-lock".
//
// The running push also gets `runningAt` set to the holder's `acquiredAt` (when
// the lock was granted) so the UI can clock push time from there rather than
// from `startedAt`, which includes the time spent queued for the lock.
export function derivePushPhases(
  markers: WorktreeOpInfo[],
  holder: PushHolder | null,
  deps: DerivePushDeps,
): WorktreeOpInfo[] {
  const running = holder && deps.isAlive(holder.pid) && deps.lockHeld() ? holder : null;
  return markers.map((m) => {
    if (m.op !== "push") return m;
    const isRunning = m.slug === running?.slug;
    return {
      ...m,
      phase: isRunning ? "running" : "waiting-for-lock",
      runningAt: isRunning && running ? running.acquiredAt : null,
    };
  });
}

// Composition used by the op-status resource loader: scan live markers, read the
// holder file, and derive push phases against the real pid/flock predicates.
export function resolveActiveWorktreeOps(): WorktreeOpInfo[] {
  return derivePushPhases(listActiveWorktreeOps(), readPushHolder(), {
    isAlive: isPidAlive,
    lockHeld: pushLockHeld,
  });
}

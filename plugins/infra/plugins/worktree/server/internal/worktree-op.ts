import {
  closeSync,
  type Dirent,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { type FileHandle, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { dlopen } from "bun:ffi";
import { SINGULARITY_DIR, WORKTREES_DIR, worktreeDataDir } from "@plugins/infra/plugins/paths/server";

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

// Every op is written up-front in the "waiting-for-lock" phase (before it
// requests its lock) and flipped to "running" the moment the lock is granted, so
// an op queued behind another reads as genuinely-queued rather than running. A
// push waits on the global push lock; a build/check waits on the per-worktree
// build lock (build) or the host build slot (direct check).
export type WorktreeOpPhase = "waiting-for-lock" | "running";

export interface WorktreeOpInfo {
  slug: string;
  op: WorktreeOp;
  // The CLI process running the op. Every marker already carries it (it is the
  // liveness key markerInfoFromParsed probes), and it is the ONLY stable handle
  // on the running process — so it is surfaced rather than dropped. Without it a
  // consumer that needs process identity (the op-wedge watchdog, which must
  // `sample`/`ps` the wedged process and dedupe per pid) would have to re-parse
  // the marker files by hand, re-deriving paths this module owns.
  pid: number;
  startedAt: string;
  phase: WorktreeOpPhase;
  // The instant this op's "running" phase began — i.e. when waiting ended and
  // work started. null while still waiting. For builds/checks it is stamped into
  // the marker by setWorktreeOpPhase on the lock grant; for pushes it is derived
  // from the holder file's `acquiredAt` (see derivePushPhases), which overrides
  // whatever the marker carries. Lets the UI clock work time separately from the
  // wait spent queued for the lock.
  runningAt: string | null;
  // The op's pre-armed inspector ws URL (`localhost:<port>/<token>`), recorded
  // by markWorktreeOpStart when the CLI launched under `bun --inspect` (see
  // cli/bin/inspect.ts). Surfaced for the same reason `pid` is: it is the only
  // handle a consumer (the op-wedge watchdog's JS interrogation) has on the
  // running process's inspector, and re-parsing marker JSON by hand would fork
  // the format away from this module. null when the op was not armed.
  inspect: string | null;
}

// The root holding every worktree's per-worktree singularity state (the `ops/`
// markers live under `<root>/<slug>/ops/`). Exposed so consumers can watch it.
export function worktreesDir(): string {
  return WORKTREES_DIR;
}

function opsDir(slug: string): string {
  return join(worktreeDataDir(slug), "ops");
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

// Single-file marker semantics: one `<op>.json` per (worktree, op), so when two
// ops of the same kind overlap in one worktree (a build queued behind another
// build) the newest overwrites the file. The accepted display consequence is
// that the newest (queued) op is what the UI shows during the overlap; the
// ownership guards in setWorktreeOpPhase/clearWorktreeOp keep the finishing op
// from mutating the file the newer op now owns.
export function markWorktreeOpStart(
  slug: string,
  op: WorktreeOp,
  phase: WorktreeOpPhase = "running",
): void {
  mkdirSync(opsDir(slug), { recursive: true });
  // CLI ops launch pre-armed with `bun --inspect=localhost:<port>/<token>`
  // (cli/bin/inspect.ts). Recording the ws URL here is what makes a live wedge
  // capturable: the op-wedge watchdog dumps this marker verbatim, so the
  // forensics name where to point the inspector client. Absent when the
  // kill-switch disabled arming (or for a non-CLI writer).
  const inspect =
    process.execArgv.find((a) => a.startsWith("--inspect="))?.slice("--inspect=".length) ?? null;
  writeFileSync(
    opFile(slug, op),
    JSON.stringify({
      op,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      phase,
      ...(inspect !== null ? { inspect } : {}),
    }),
  );
}

// Rewrite an existing marker's phase, preserving pid/startedAt (and any
// runningAt). No-op if the marker is gone (op already finished and cleared) or
// names another pid — a lock-acquiring build must not flip a marker a newer
// queued build now owns. Flipping to "running" stamps `runningAt` (the lock-grant
// instant) once: the first waiting→running transition wins, so a re-flip can't
// reset the work clock.
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
  if (typeof parsed.pid === "number" && parsed.pid !== process.pid) return;
  const runningAt =
    phase === "running" && typeof parsed.runningAt !== "string"
      ? new Date().toISOString()
      : parsed.runningAt;
  writeFileSync(path, JSON.stringify({ ...parsed, phase, runningAt }));
}

// Remove a marker ONLY if it still names this process — a finishing op must not
// delete a marker a newer queued op now owns (a second build overwrites the
// single file with its own pid while queued behind us on the build lock, then we
// exit and would otherwise reap its live marker). An absent, unreadable, or
// garbage marker is reaped unconditionally (safe reap). Mirrors clearPushHolder.
export function clearWorktreeOp(slug: string, op: WorktreeOp): void {
  const path = opFile(slug, op);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as MarkerJson;
    if (typeof parsed.pid === "number" && parsed.pid !== process.pid) return;
  } catch (err) {
    if (!isReapableReadError(err)) throw err;
    // absent / unreadable / garbage → fall through to the safe reap.
  }
  rmSync(path, { force: true });
}

// A caught read error we should treat as "reap the marker" rather than propagate:
// an fs error (ENOENT, EACCES, …) or garbled JSON (SyntaxError). A genuinely
// unexpected error (code == null and not a SyntaxError) is re-thrown by callers.
function isReapableReadError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code != null || err instanceof SyntaxError;
}

type MarkerJson = {
  op?: unknown;
  pid?: unknown;
  startedAt?: unknown;
  phase?: unknown;
  runningAt?: unknown;
  inspect?: unknown;
};

// Pure: turn a parsed marker into its WorktreeOpInfo, or null if it names a dead
// pid (a caller reaps the file on null). No IO — shared by the sync and async
// marker readers.
function markerInfoFromParsed(slug: string, parsed: MarkerJson): WorktreeOpInfo | null {
  if (typeof parsed.pid !== "number" || !isPidAlive(parsed.pid)) return null;
  return {
    slug,
    op: KNOWN_OPS.includes(parsed.op as WorktreeOp) ? (parsed.op as WorktreeOp) : "build",
    pid: parsed.pid,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date(0).toISOString(),
    // Back-compat: markers written before the phase field default to "running".
    phase: parsed.phase === "waiting-for-lock" ? "waiting-for-lock" : "running",
    // Builds/checks stamp their own runningAt on the lock grant; for pushes it is
    // overridden by derivePushPhases from the authoritative holder file.
    runningAt: typeof parsed.runningAt === "string" ? parsed.runningAt : null,
    inspect: typeof parsed.inspect === "string" ? parsed.inspect : null,
  };
}

// Parse one marker file, reaping it if dead or unparseable, so a SIGKILLed
// build/push (which can't run its own cleanup) self-heals on the next read.
// Returns the live marker's data, or null if the marker was reclaimed. ASYNC so
// the marker scan yields the event loop (readFile runs on the libuv threadpool)
// instead of blocking a runtime — shared by every marker reader
// (isWorktreeOpActive, the flush-cycle loader). Reaping still uses rmSync: it
// only fires for already-dead markers, and the write/clear TOCTOU is inherent to
// the marker scheme — the async read doesn't worsen it. isPidAlive stays sync (a
// signal syscall, not IO).
async function readLiveMarkerAsync(slug: string, path: string): Promise<WorktreeOpInfo | null> {
  let parsed: MarkerJson;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as MarkerJson;
  } catch (err) {
    if (!isReapableReadError(err)) throw err;
    // Unreadable/garbage marker — reclaim it.
    rmSync(path, { force: true });
    return null;
  }
  const info = markerInfoFromParsed(slug, parsed);
  if (!info) rmSync(path, { force: true }); // dead pid — reclaim.
  return info;
}

// True iff any op marker for this worktree names a live pid. Reaps dead or
// unparseable markers as it scans. ASYNC: this is called per-pane by the tmux
// status poller, so the scan must yield the event loop (readdir/readFile on the
// libuv threadpool) rather than block that runtime under filesystem IO
// contention. Per-file reads run in parallel, like listActiveWorktreeOps.
export async function isWorktreeOpActive(slug: string): Promise<boolean> {
  const dir = opsDir(slug);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  const infos = await Promise.all(files.map((f) => readLiveMarkerAsync(slug, join(dir, f))));
  return infos.some((i) => i !== null);
}

// Every live op marker across all worktrees, parsed into WorktreeOpInfo. Reaps
// dead/garbage markers as it scans, like isWorktreeOpActive. ASYNC: this runs
// inside the op-status loader (the shared flush cycle), so every IO must yield
// the event loop rather than block it. Per-slug scans run in parallel for lower
// wall-clock latency; the only caller is resolveActiveWorktreeOps.
export async function listActiveWorktreeOps(): Promise<WorktreeOpInfo[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(worktreesDir(), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const perSlug = await Promise.all(
    entries.map(async (entry): Promise<WorktreeOpInfo[]> => {
      // worktreesDir() holds both worktree directories AND per-worktree gateway
      // registration files (`<slug>.json`); only directories carry an ops/
      // subdir, so descending into a `.json` file would throw ENOTDIR. Skip
      // non-dirs.
      if (!entry.isDirectory()) return [];
      const slug = entry.name;
      const dir = opsDir(slug);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        return []; // Not a worktree-with-ops dir; skip.
      }
      const infos = await Promise.all(files.map((f) => readLiveMarkerAsync(slug, join(dir, f))));
      return infos.filter((i): i is WorktreeOpInfo => i !== null);
    }),
  );
  return perSlug.flat();
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

// The push mutex is now the `push` host-pool's single slot file (declared via
// `defineHostPool({ id: "push", size: 1 })` in host-admission). Its slot-0 lock
// IS the push mutex, so this probe path MUST equal the pool's slot-0 path
// (`~/.singularity/push-slots/slot-0.lock`, mirrored as `PUSH_SLOT_PATH` in
// host-admission/server). The CLI push acquires the pool; this probes the same
// kernel flock it holds, keeping the op-status derivation authoritative.
export const PUSH_LOCK_PATH = join(SINGULARITY_DIR, "push-slots", "slot-0.lock");
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

// Async twin of pushLockHeld for the flush-cycle loader: the file open/close is
// IO and runs on the libuv threadpool, but the flock() probe itself is a fast,
// non-blocking syscall (LOCK_NB) — not IO wait — so it stays a synchronous FFI
// call. Identical semantics to the sync version: ENOENT on open ⇒ false; a
// non-zero flock return ⇒ held; always release/close.
async function pushLockHeldAsync(lockPath: string = PUSH_LOCK_PATH): Promise<boolean> {
  await mkdir(SINGULARITY_DIR, { recursive: true });
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "a");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
  try {
    // Non-zero return ⇒ EWOULDBLOCK ⇒ someone else holds it.
    return flock(handle.fd, LOCK_EX | LOCK_NB) !== 0;
  } finally {
    await handle.close(); // releases the flock if we happened to acquire it
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

// Pure: validate a parsed holder blob into a PushHolder, or null if malformed.
// No IO — shared by the sync and async holder readers.
function holderFromParsed(parsed: Partial<PushHolder>): PushHolder | null {
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

export function readPushHolder(path: string = PUSH_HOLDER_PATH): PushHolder | null {
  try {
    return holderFromParsed(JSON.parse(readFileSync(path, "utf8")) as Partial<PushHolder>);
  } catch (err) {
    if (!isReapableReadError(err)) throw err;
    return null; // absent or unparseable
  }
}

// Async twin of readPushHolder for the flush-cycle loader (readFile on the libuv
// threadpool). Identical semantics: absent/unparseable/malformed ⇒ null.
async function readPushHolderAsync(path: string = PUSH_HOLDER_PATH): Promise<PushHolder | null> {
  try {
    return holderFromParsed(JSON.parse(await readFile(path, "utf8")) as Partial<PushHolder>);
  } catch (err) {
    if (!isReapableReadError(err)) throw err;
    return null; // absent or unparseable
  }
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
// ASYNC and fully off the event loop — this is the flush-cycle path, so it must
// never do synchronous IO. The three reads run in parallel; the flock probe is
// pre-resolved to a boolean so derivePushPhases (pure, sync) can consume it.
export async function resolveActiveWorktreeOps(): Promise<WorktreeOpInfo[]> {
  const [markers, holder, lockHeld] = await Promise.all([
    listActiveWorktreeOps(),
    readPushHolderAsync(),
    pushLockHeldAsync(),
  ]);
  return derivePushPhases(markers, holder, {
    isAlive: isPidAlive,
    lockHeld: () => lockHeld,
  });
}

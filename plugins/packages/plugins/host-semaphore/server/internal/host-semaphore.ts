import { dlopen } from "bun:ffi";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// Cross-process twin of `createSemaphore` (the in-process counter+queue gate in
// `packages/semaphore`). Bounds CPU-heavy work *across* the ~16 worktree server
// processes sharing one box, not just within one. The bound is N flock(2) lock
// files under `~/.singularity/<name>-slots/`: at most one holder per fd, so at
// most `size` holders host-wide. flock auto-releases when the fd closes OR the
// holding process dies, so a SIGKILLed server never leaks a slot — the same
// crash-safety every host pool relies on (declared via `infra/host-admission`).
//
// Hybrid acquire:
//  - Fast path: an in-process *non-blocking* `flock(LOCK_NB)` sweep — microsecond
//    syscalls that never freeze the event loop. When a slot is free this is the
//    whole story; no subprocess, no tax.
//  - Slow path (all slots busy): we must *wait* for a slot, but a blocking
//    `flock(LOCK_EX)` would freeze the long-running event loop. We can't wait on a
//    single slot fd either — a blocking flock parks on ONE open file description,
//    so if a *different* slot frees the waiter is never woken and that slot sits
//    idle (the stranding defect). Instead the head waiter *fans out*: it spawns one
//    `flock-wait` child per slot and takes the FIRST to grant, so ANY freed slot
//    wakes it — including one freed by a SIGKILLed holder, which flock releases too.
//    A per-pool **turnstile** (itself a single flock file) ensures only the *head*
//    waiter fans out host-wide, so the extra process cost is a fixed `size - 1` per
//    contended pool, not `size × waiters`.
//
// Deadlock-free: the turnstile is only ever held by *waiters*; a slot-holder never
// needs it, and a turnstile-holder waits only for a slot, which holders always
// release. The wait-for graph is acyclic.
//
// Barging is unchanged: the fast-path sweep does not consult the turnstile, so a
// fresh caller can still take a slot a queued waiter was about to win. The turnstile
// buys serialized *wakeup*, not FIFO *fairness*.
//
// Reserved floor: with `backgroundLimit < size`, slot *capacity* is partitioned by
// lane. `background` may only sweep/fan-out over `slot-0 … slot-(backgroundLimit-1)`;
// `interactive` may use every slot but sweeps them HIGH-index-first, so the reserved
// high slots fill before the shared low slots and a saturated background lane can
// never starve interactive work. The turnstile stays PER-POOL (shared across lanes) —
// only slot capacity is partitioned, not the wakeup serialization — so an interactive
// waiter may briefly queue behind a background waiter's fan-out for the wakeup (a few
// ms), never for a slot.

const FLOCK_WAIT_PATH = join(import.meta.dir, "..", "..", "scripts", "flock-wait.ts");

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

const GRANTED = "granted\n";

// Spawn one `flock-wait` child that blocks (off our event loop) on ONE lock file and
// writes "granted\n" once it holds it. `--smol` halves RSS (37 MB vs 76 MB).
//
// Module-level on purpose: `WaitChild` is derived from *this* function's return type,
// so the literal `stdin: "pipe"` / `stdout: "pipe"` options narrow `stdin` to a
// `FileSink` and `stdout` to a `ReadableStream`. A bare `ReturnType<typeof Bun.spawn>`
// widens both to `number | ... | undefined` and every `.stdin.end()` / stream read
// below stops type-checking.
function spawnWait(file: string) {
  return Bun.spawn([process.execPath, "--smol", FLOCK_WAIT_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, HOST_SEM_LOCK_FILE: file },
  });
}

type WaitChild = ReturnType<typeof spawnWait>;

export interface HostShare {
  /** Slots actually held — always >= 1, never > the requested max. */
  readonly slots: number;
  /** Idempotent. Closes local fds and reaps the winner child (if one was spawned). */
  release(): Promise<void>;
}

/**
 * Reserved-floor lane. A pool with `backgroundLimit < size` partitions its slots by
 * lane so background work can never starve interactive work of the whole pool:
 *  - `background` may use only the low `backgroundLimit` slots (`slot-0 …
 *    slot-(backgroundLimit-1)`), swept low-index-first.
 *  - `interactive` may use ALL `size` slots, but sweeps them **high-index-first**
 *    (`slot-(size-1) … slot-0`). Without that reversal, interactive holders would take
 *    the low slots in file order and the reserved floor (the high slots background can
 *    never reach) would sit empty while background starves — the whole trick.
 *
 * Default `background`: the safe choice, since it can never encroach on the reserved
 * floor. When `backgroundLimit === size` (the un-partitioned default), both lanes
 * collapse to the full slot set — `interactive` in reverse order, `background` in
 * forward order — and lane windowing is behaviourally inert.
 */
export type Lane = "interactive" | "background";

/**
 * Per-acquire options: the reserved-floor `lane` plus two observability hooks. The
 * hooks are optional and neither gates behavior; they let callers make the gate
 * visible (profiler spans, log lines) without coupling this primitive to any of that.
 * `lane` DOES gate behavior — it selects the slot window and sweep order (see `Lane`).
 */
export interface AcquireHooks {
  /**
   * Which reserved-floor lane this acquire draws from. Default `background`. On an
   * un-partitioned pool (`backgroundLimit === size`) it only affects sweep *order*,
   * not which slots are reachable.
   */
  lane?: Lane;
  /**
   * The slow path was entered (every slot in the lane's window busy), BEFORE any child
   * is spawned. Never fires on the fast path. Lets a caller *open* a "waiting for a
   * slot" span, which `onAcquired` (fired once, at acquisition) can never express.
   */
  onWaitStart?(): void;
  /**
   * Always fires, fast path or slow, exactly once, at acquisition, before the body
   * runs. Its argument is the milliseconds spent waiting (≈0 on the fast path).
   * Replaces the old positional `onWait` and keeps identical semantics.
   */
  onAcquired?(waitMs: number): void;
}

export interface HostSemaphore {
  /**
   * Run `fn` once a host-wide slot is free, releasing the slot when it settles.
   * The slot is released in a `finally`, so a rejecting `fn` never leaks one —
   * `run` rejects with the same error. Mirrors `Semaphore.run` exactly, except
   * the bound is enforced across processes (flock) rather than in-process.
   *
   * A thin wrapper over `acquireShare(1, hooks)`: acquire exactly one slot, hold it
   * across `fn`, release in a `finally`. That dedup keeps the fast/slow acquire,
   * `depth()` semantics, and crash-safety identical between the two entry points.
   */
  run<T>(fn: () => Promise<T>, hooks?: AcquireHooks): Promise<T>;

  /**
   * Block until at least ONE slot is held, then greedily take any additional
   * free slots up to `max` with a single non-blocking sweep. Returns a
   * `HostShare` naming how many slots were actually taken (`1 … min(max, size)`)
   * and a `release()` that hands them all back.
   *
   * The point is one *share* per caller, not one child per slot in steady state: a
   * caller that fans out N units of work acquires its whole share once, up front,
   * instead of spawning N waiters (one per unit) precisely when the box is already
   * busy. The idle-pool case is the fast path — pure in-process `flock(LOCK_NB)`
   * sweep, no subprocess. Only when every slot is busy do we take the turnstile and
   * fan out one blocking child per slot to wait for the FIRST free slot; a second
   * non-blocking sweep then picks up whatever else freed while we waited.
   *
   * `max` is clamped to the acquiring lane's window size (`backgroundLimit` for the
   * `background` lane, `size` for `interactive`) — asking for more slots than the
   * window holds is a no-op past the ceiling, not an error. Never returns fewer than
   * 1 slot — it blocks or throws instead, so a caller never has to distinguish "got a
   * share" from "got nothing". The `lane` field of `hooks` selects the reserved-floor
   * window and sweep order (default `background`; see `Lane`).
   */
  acquireShare(max: number, hooks?: AcquireHooks): Promise<HostShare>;

  /**
   * The number of callers currently parked on the SLOW path (all slots busy,
   * fanning out for a slot). Fast-path callers that grabbed a slot immediately are
   * NOT counted — this is the queue-depth gauge, not the in-flight count. 0 means
   * the gate is uncontended. Observability-only; never gates behavior.
   */
  depth(): number;
}

/**
 * Cross-process bounded-concurrency gate: at most `size` `run` bodies execute at
 * once across every process sharing the same `name`. `name` keys the slot
 * directory (`~/.singularity/<name>-slots/`) and must be a safe filename segment.
 *
 * `backgroundLimit` (default `size`, i.e. no reserved floor) caps how many slots the
 * `background` lane may take, reserving the remaining `size - backgroundLimit` slots
 * for the `interactive` lane (see `Lane`). It must be an integer in `1 … size`. When
 * left at the default, lane windowing is inert and behavior is identical to an
 * un-laned pool.
 */
export function createHostSemaphore(opts: {
  name: string;
  size: number;
  backgroundLimit?: number;
}): HostSemaphore {
  const { name, size, backgroundLimit = size } = opts;
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`createHostSemaphore: size must be a positive integer, got ${size}`);
  }
  if (!Number.isInteger(backgroundLimit) || backgroundLimit < 1 || backgroundLimit > size) {
    throw new Error(
      `createHostSemaphore: backgroundLimit must be an integer in 1..${size}, got ${backgroundLimit}`,
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `createHostSemaphore: name must match /^[a-z0-9][a-z0-9-]*$/, got ${JSON.stringify(name)}`,
    );
  }

  // The ordered slot-index window a lane may sweep. `background` is confined to the
  // low `backgroundLimit` slots in forward order; `interactive` may use every slot but
  // sweeps them high-index-first so the reserved floor (the high slots) fills before
  // the shared low slots, leaving the low slots for background. This is the whole
  // reserved-floor trick and it costs one reversal. When `backgroundLimit === size`
  // the two windows cover the same set — `interactive` reversed, `background` forward.
  const laneOrder = (lane: Lane): number[] =>
    lane === "background"
      ? Array.from({ length: backgroundLimit }, (_, i) => i)
      : Array.from({ length: size }, (_, i) => size - 1 - i);

  const slotsDir = join(SINGULARITY_DIR, `${name}-slots`);
  const slotFile = (i: number) => join(slotsDir, `slot-${i}.lock`);
  const turnstileFile = join(slotsDir, "turnstile.lock");
  const sizeFile = join(slotsDir, "size");
  const guardFile = join(slotsDir, ".size.lock");

  // Queue-depth gauge: how many callers are currently parked on the slow path.
  // Incremented when entering the slow path and decremented in a `finally`
  // bracketing the whole wait — never inline, since a thrown acquire would
  // otherwise permanently inflate the gauge.
  let waiting = 0;

  // Size AND the lane split are part of the pool's identity. `size` names the
  // slot-file *set*, so an old-size process holding `slot-7.lock` is invisible to a
  // new-size process that only sweeps `slot-0..3` — the bound would be silently
  // exceeded. `backgroundLimit` names where the reserved floor begins, so two
  // processes that disagree on it partition the same slots differently — one's
  // background slot is another's reserved-interactive slot, and the floor guarantee
  // silently breaks. The sentinel encodes BOTH as `"<size>:<backgroundLimit>"`, so a
  // process built for a different split is as loud as one built for a different size.
  // Checked once per instance, lazily on first acquire — memoized as the in-flight
  // *promise* (not a boolean) so concurrent in-process `acquireShare` calls await one
  // check instead of racing, and cleared on failure so a pool whose mismatch was since
  // resolved isn't wedged by a cached rejection.
  let sizeCheck: Promise<void> | undefined;

  function readSentinel(): { size: number; backgroundLimit: number } | undefined {
    let raw: string;
    try {
      raw = readFileSync(sizeFile, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
    // Identity is "<size>:<backgroundLimit>". A bare "<size>" is the LEGACY format
    // (pre-reserved-floor) and means "no floor" — i.e. backgroundLimit === size — so
    // it parses cleanly rather than throwing: the four historical non-laned pools keep
    // their slot dirs, and their on-disk "4"/"3"/"2" sentinels must migrate silently,
    // not crash the first acquire on a hot server path. Anything else — a number
    // missing/invalid, backgroundLimit > size, or a stray third field — is genuine
    // corruption, and loud.
    const parts = raw.trim().split(":");
    const s = parseInt(parts[0] ?? "", 10);
    const bg = parts.length === 1 ? s : parseInt(parts[1] ?? "", 10);
    if (
      parts.length > 2 ||
      !Number.isInteger(s) ||
      s < 1 ||
      !Number.isInteger(bg) ||
      bg < 1 ||
      bg > s
    ) {
      throw new Error(
        `createHostSemaphore(${name}): corrupt size sentinel ${JSON.stringify(raw)}`,
      );
    }
    return { size: s, backgroundLimit: bg };
  }

  // Always writes *this* pool's identity — the closure's `size`/`backgroundLimit` are
  // the only values it can legitimately record.
  function writeSentinelAtomic(): void {
    const tmp = `${sizeFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${size}:${backgroundLimit}`);
    renameSync(tmp, sizeFile);
  }

  // Memoize the check as a promise. Concurrent in-process callers share one run; a
  // rejection clears the memo so a since-resolved mismatch isn't cached forever.
  function ensureSizeIdentity(): Promise<void> {
    if (!sizeCheck) {
      sizeCheck = doEnsureSizeIdentity().catch((err) => {
        sizeCheck = undefined;
        throw err;
      });
    }
    return sizeCheck;
  }

  async function doEnsureSizeIdentity(): Promise<void> {
    mkdirSync(slotsDir, { recursive: true });

    // Take the size guard. Non-blocking in-process first; if it's contended, another
    // process is mid-initialization — that is a benign flock race, NOT a broken
    // invariant, so we WAIT for the guard via one `flock-wait` child (the turnstile
    // pattern) rather than crash. A blocking in-process flock is banned (freezes the
    // loop) and polling is banned; the child does the blocking wait off our loop.
    const guardFd = openSync(guardFile, "w");
    let guardChild: WaitChild | undefined;
    if (ffi.flock(guardFd, LOCK_EX | LOCK_NB) !== 0) {
      closeSync(guardFd);
      guardChild = spawnWait(guardFile);
      await awaitGranted(guardChild.stdout, name);
    }
    const releaseGuard = async (): Promise<void> => {
      if (guardChild) {
        // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- trivial fire-and-forget child-stdin close before kill(); no work to attribute
        void guardChild.stdin.end();
        guardChild.kill();
        await guardChild.exited;
      } else {
        closeSync(guardFd);
      }
    };

    try {
      // Re-read the sentinel AFTER the guard is genuinely held — the process we
      // queued behind may have just written it.
      const sentinel = readSentinel();
      if (sentinel === undefined) {
        // First process to touch this pool — record its size:split identity.
        writeSentinelAtomic();
      } else if (sentinel.size !== size || sentinel.backgroundLimit !== backgroundLimit) {
        // Mismatch on EITHER axis. Safe to resize ONLY if the pool is idle: LOCK_NB-
        // sweep every slot across both sizes. If any is held, an out-of-identity
        // process is live — a silent overcommit (size) or a broken reserved floor
        // (split) would follow — so crash instead (the ONE genuine throw).
        const hi = Math.max(sentinel.size, size);
        const probeFds: number[] = [];
        let allFree = true;
        for (let i = 0; i < hi; i++) {
          const fd = openSync(slotFile(i), "w");
          probeFds.push(fd);
          if (ffi.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
            allFree = false;
            break;
          }
        }
        if (!allFree) {
          for (const fd of probeFds) closeSync(fd);
          throw new Error(
            `createHostSemaphore(${name}): pool is live at size ` +
              `${sentinel.size}:${sentinel.backgroundLimit}, but this process was built ` +
              `for ${size}:${backgroundLimit}`,
          );
        }
        // Pool idle → rewrite the sentinel, drop the now-extra slot files (only when
        // shrinking `size`), release every probe fd.
        writeSentinelAtomic();
        for (let i = size; i < sentinel.size; i++) rmSync(slotFile(i), { force: true });
        for (const fd of probeFds) closeSync(fd);
      }
    } finally {
      await releaseGuard();
    }
  }

  // Non-blocking sweep over the lane's `order` window: open each slot fd in order,
  // `flock(LOCK_NB)` it, and KEEP the first `limit` fds that lock (the caller owns and
  // must close them to release). Every other fd — past the limit, or one that failed
  // to lock — is closed immediately. All in-process microsecond syscalls; never
  // freezes the loop the way LOCK_EX would. Slots OUTSIDE `order` (e.g. the reserved
  // floor for a background caller) are never opened, so they are structurally
  // unreachable. `limit === 0` locks nothing and returns [].
  function sweepKeep(limit: number, order: number[]): number[] {
    mkdirSync(slotsDir, { recursive: true });
    const kept: number[] = [];
    for (const i of order) {
      const fd = openSync(slotFile(i), "w");
      if (kept.length < limit && ffi.flock(fd, LOCK_EX | LOCK_NB) === 0) {
        kept.push(fd);
      } else {
        closeSync(fd);
      }
    }
    return kept;
  }

  // Fan out over the lane's `order` window: spawn one child per slot in that window,
  // take the FIRST to grant (any freed slot in the window wakes us), then SIGKILL and
  // reap the losers. Confining the children to `order` is what keeps a background
  // waiter off the reserved floor even on the slow path. SIGKILL cannot be caught;
  // process death cancels a blocked flock, and a loser that had already grabbed a
  // *different* slot releases it by dying. Awaiting `exited` is mandatory — it reaps
  // the zombies AND guarantees their slots are back before the caller re-sweeps for
  // extras.
  async function fanOut(order: number[]): Promise<WaitChild> {
    const children = order.map((i) => spawnWait(slotFile(i)));

    // Attach ALL readers BEFORE awaiting — a sequential read would deadlock on the
    // wrong (still-blocked) child. `Promise.any` settles on the first SUCCESS and
    // only rejects (AggregateError) if EVERY child closed without granting; its
    // attached handlers also swallow the losers' later rejections when we kill them,
    // so there is no floating rejection.
    const readers = children.map((child, i) => awaitGranted(child.stdout, name).then(() => i));

    let winnerIndex: number;
    try {
      winnerIndex = await Promise.any(readers);
    } catch (err) {
      // Every fan-out child died before granting — loud, never a silent bound drop.
      throw new Error(
        `createHostSemaphore(${name}): all ${order.length} fan-out children exited before granting a slot`,
        { cause: err },
      );
    }

    const winner = children[winnerIndex]!;
    const losers = children.filter((_, i) => i !== winnerIndex);
    for (const l of losers) l.kill(9);
    await Promise.all(losers.map((l) => l.exited));
    return winner;
  }

  async function acquireShare(max: number, hooks?: AcquireHooks): Promise<HostShare> {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`acquireShare: max must be a positive integer, got ${max}`);
    }
    const lane: Lane = hooks?.lane ?? "background";
    const order = laneOrder(lane);
    const t0 = performance.now();
    await ensureSizeIdentity();
    // Asking for more slots than the lane's window holds can't beat its ceiling —
    // clamp to the window size (`backgroundLimit` for background, `size` for
    // interactive) so the fast-path sweep and the extras re-sweep agree on the bound.
    const effectiveMax = Math.min(max, order.length);

    // Fast path: non-blocking sweep over the lane window for up to `effectiveMax`
    // slots. On a window with any free slot this is the whole story — no turnstile,
    // no subprocess.
    let fds = sweepKeep(effectiveMax, order);
    let winner: WaitChild | undefined;

    if (fds.length === 0) {
      // Slow path: every slot is busy (sweepKeep closed all fds it opened).
      hooks?.onWaitStart?.();
      waiting++;
      try {
        // (a) Turnstile — only the head waiter fans out host-wide. Take it
        // non-blocking in-process; if contended, wait for it via a single child (a
        // turnstile is one file, so an ordinary flock queue on it can't strand).
        let turnstileFd: number | undefined = openSync(turnstileFile, "w");
        let turnstileChild: WaitChild | undefined;
        if (ffi.flock(turnstileFd, LOCK_EX | LOCK_NB) !== 0) {
          closeSync(turnstileFd);
          turnstileFd = undefined;
          turnstileChild = spawnWait(turnstileFile);
          await awaitGranted(turnstileChild.stdout, name);
        }

        let turnstileReleased = false;
        const releaseTurnstile = async (): Promise<void> => {
          if (turnstileReleased) return;
          turnstileReleased = true;
          if (turnstileFd !== undefined) closeSync(turnstileFd);
          if (turnstileChild) {
            // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- trivial fire-and-forget child-stdin close before kill(); no work to attribute
            void turnstileChild.stdin.end();
            turnstileChild.kill();
            await turnstileChild.exited;
          }
        };

        try {
          // (b) Re-sweep the lane window: a slot may have freed while we queued for
          // the turnstile.
          fds = sweepKeep(effectiveMax, order);
          if (fds.length === 0) {
            // (c) Fan out over the lane's window and take the first grant; (d) reap
            // the losers so their slots are back.
            winner = await fanOut(order);
            // (d') Release the turnstile so the next waiter can fan out, BEFORE we
            // (e) re-sweep for up to `effectiveMax - 1` EXTRA slots. The winner's own
            // slot is held by the winner child, so it fails to lock here and is never
            // double-counted.
            await releaseTurnstile();
            fds = sweepKeep(effectiveMax - 1, order);
          }
        } finally {
          // Covers the (b)-success path and any throw from fanOut — never strand it.
          await releaseTurnstile();
        }
      } finally {
        waiting--;
      }
    }

    hooks?.onAcquired?.(performance.now() - t0);

    let released = false;
    const release = async (): Promise<void> => {
      // Idempotent: a caller may release in a `finally` that also runs on a path
      // where it already released. Guard so the second call is a no-op.
      if (released) return;
      released = true;
      // Closing every kept fd releases those slots (flock auto-release).
      for (const fd of fds) closeSync(fd);
      if (winner) {
        // Closing stdin gives the winner EOF → it exits → its fd closes → the flock
        // releases. Fire-and-forget the flush; correctness is guaranteed by kill() +
        // awaiting exited, which reaps the child so we never leave a zombie.
        // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- trivial fire-and-forget child-stdin close before kill(); no work to attribute
        void winner.stdin.end();
        winner.kill();
        await winner.exited;
      }
    };

    // slots = (the winner child's one slot, if we took the slow path) + the fds we
    // hold directly. Always >= 1: on the fast path fds.length >= 1 (we only fall to
    // the slow path when it's 0); on the slow path the winner contributes the 1.
    return { slots: (winner ? 1 : 0) + fds.length, release };
  }

  return {
    depth: () => waiting,

    acquireShare,

    async run<T>(fn: () => Promise<T>, hooks?: AcquireHooks): Promise<T> {
      const share = await acquireShare(1, hooks);
      try {
        return await fn();
      } finally {
        await share.release();
      }
    },
  };
}

/**
 * Read `stream` until the literal `"granted\n"` token appears (the child holds its
 * lock). Async — the event loop is never blocked. If the stream closes without the
 * token, the child died before acquiring → throw loudly (a swallowed failure here
 * would silently drop the gate's bound). In fan-out, a loser rejecting this way is
 * expected and absorbed by `Promise.any`.
 */
async function awaitGranted(stream: ReadableStream<Uint8Array>, name: string): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(GRANTED)) return;
      if (done) {
        throw new Error(
          `createHostSemaphore(${name}): flock-wait child exited before granting a slot ` +
            `(stdout closed without "granted")`,
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}

import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { flockTry } from "@plugins/packages/plugins/flock/server";
import type { DataDir } from "@plugins/infra/plugins/paths/core";

// Cross-process twin of `createSemaphore` (the in-process counter+queue gate in
// `packages/semaphore`). Bounds CPU-heavy work *across* the ~16 worktree server
// processes sharing one box, not just within one. The bound is N flock(2) lock
// files in a caller-supplied declared directory: at most one holder per fd, so at
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

const FLOCK_WAIT_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "scripts",
  "flock-wait.ts",
);

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
   * The slot-file set this instance is currently sweeping — the pool's LIVE
   * identity, which is not always the `size` this process was built for: when
   * another process already has the pool open at a different size, this instance
   * adopts that one (see `createHostSemaphore`). Observability only; the acquire
   * path reads the same value internally.
   *
   * Reflects the last reconcile, so it is the declared size until the first
   * acquire has run.
   */
  liveSize(): number;

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
 * once across every process sharing the same slot directory.
 *
 * `slots` is that directory, and the caller supplies it as a **declared**
 * `DataDir` — this primitive derives no path of its own. It used to, with
 * ``join(SINGULARITY_DIR, `${name}-slots`)``, and that one line is why the data
 * root grew a top-level directory per pool that nothing in the repo could
 * enumerate. The pool's identity (the `name` in every error below) is the
 * directory's own declared name, so the two can no longer disagree.
 *
 * The path is read through `slots.path` on every use, never captured at
 * construction: `defineHostPool` runs at consumer module eval, and a frozen
 * value there would not follow a `SINGULARITY_DIR` the release launcher sets
 * later.
 *
 * `backgroundLimit` (default `size`, i.e. no reserved floor) caps how many slots the
 * `background` lane may take, reserving the remaining `size - backgroundLimit` slots
 * for the `interactive` lane (see `Lane`). It must be an integer in `1 … size`. When
 * left at the default, lane windowing is inert and behavior is identical to an
 * un-laned pool.
 */
export function createHostSemaphore(opts: {
  slots: DataDir;
  size: number;
  backgroundLimit?: number;
}): HostSemaphore {
  const { slots } = opts;
  // The pool's identity, for the error messages below. Not a separate input:
  // `defineDataDir` already validated it as one lowercase-kebab path segment, so
  // the name-vs-directory drift the old `name` parameter allowed is gone.
  const name = slots.spec.name;
  const declaredSize = opts.size;
  const declaredBackgroundLimit = opts.backgroundLimit ?? declaredSize;
  if (!Number.isInteger(declaredSize) || declaredSize < 1) {
    throw new Error(
      `createHostSemaphore: size must be a positive integer, got ${declaredSize}`,
    );
  }
  if (
    !Number.isInteger(declaredBackgroundLimit) ||
    declaredBackgroundLimit < 1 ||
    declaredBackgroundLimit > declaredSize
  ) {
    throw new Error(
      `createHostSemaphore: backgroundLimit must be an integer in 1..${declaredSize}, got ${declaredBackgroundLimit}`,
    );
  }
  // The identity this instance is ACTUALLY sweeping. It starts at the declared pair
  // and is reconciled against the on-disk sentinel on every acquire: when another
  // process already has the pool open at a different pair, this instance adopts that
  // one rather than imposing its own (see `doEnsureSizeIdentity`). Mutable for exactly
  // that reason — everything below reads these through the closure at call time, so an
  // adoption re-aims the sweep, the lane windows and the `max` clamp together.
  let size = declaredSize;
  let backgroundLimit = declaredBackgroundLimit;

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

  // Resolved per call, never captured — see the docblock on `slots`.
  const slotFile = (i: number) => slots.file(`slot-${i}.lock`);
  const turnstileFile = () => slots.file("turnstile.lock");
  const sizeFile = () => slots.file("size");
  const guardFile = () => slots.file(".size.lock");

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
  // silently breaks. The `<dir>/size` sentinel encodes BOTH as
  // `"<size>:<backgroundLimit>"` and is the ONE authority every process defers to.
  //
  // Reconciled on EVERY acquire, not once per instance: the pool's identity is host
  // state, and a long-lived process that checked once could keep sweeping a slot set
  // the rest of the host has since stopped looking at — the very overcommit the
  // sentinel exists to prevent. The check is a single read of a ~4-byte file on the
  // agreeing path (the overwhelming case) and only takes the guard + does real work
  // when the on-disk pair has actually moved. In-flight runs are shared (the promise
  // memo) so concurrent in-process acquires reconcile once rather than racing, and the
  // memo clears on settle so nothing caches a since-resolved state.
  let reconcile: Promise<void> | undefined;

  function readSentinel():
    { size: number; backgroundLimit: number } | undefined {
    let raw: string;
    try {
      raw = readFileSync(sizeFile(), "utf8");
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

  // Always writes the DECLARED identity — the pair this process was built for is the
  // only one it can legitimately claim authorship of. Called only where claiming it is
  // legal: a first touch, or a resize of a pool proven idle. An adoption never writes.
  function writeSentinelAtomic(): void {
    const path = sizeFile();
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${declaredSize}:${declaredBackgroundLimit}`);
    renameSync(tmp, path);
    size = declaredSize;
    backgroundLimit = declaredBackgroundLimit;
  }

  // Cheap agreement test first: when the live sentinel already names the DECLARED pair
  // there is nothing to reconcile, so the steady state is one small read — no guard, no
  // probe, no subprocess.
  //
  // The test is against the declared pair, NOT the pair currently being swept. An
  // adopted instance disagrees with its own declaration by construction, so it re-runs
  // the guarded reconcile on every acquire — which is exactly what lets the declared
  // pair land the moment the pool goes idle. Comparing against the adopted pair instead
  // would make an adoption permanent for the instance's whole life, so a long-lived
  // backend that adopted once during a rolling change would never converge.
  //
  // Concurrent in-process callers share the in-flight run; the memo clears on settle so
  // the next acquire re-reads rather than trusting a stale outcome.
  function ensureSizeIdentity(): Promise<void> {
    const live = readSentinel();
    if (
      live !== undefined &&
      live.size === declaredSize &&
      live.backgroundLimit === declaredBackgroundLimit
    ) {
      size = declaredSize;
      backgroundLimit = declaredBackgroundLimit;
      return Promise.resolve();
    }
    if (!reconcile) {
      reconcile = doEnsureSizeIdentity().finally(() => {
        reconcile = undefined;
      });
    }
    return reconcile;
  }

  async function doEnsureSizeIdentity(): Promise<void> {
    slots.ensure();

    // Take the size guard. Non-blocking in-process first; if it's contended, another
    // process is mid-initialization — that is a benign flock race, NOT a broken
    // invariant, so we WAIT for the guard via one `flock-wait` child (the turnstile
    // pattern) rather than crash. A blocking in-process flock is banned (freezes the
    // loop) and polling is banned; the child does the blocking wait off our loop.
    const guard = guardFile();
    const guardFd = openSync(guard, "w");
    let guardChild: WaitChild | undefined;
    if (!flockTry(guardFd)) {
      closeSync(guardFd);
      guardChild = spawnWait(guard);
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
      } else if (
        sentinel.size !== declaredSize ||
        sentinel.backgroundLimit !== declaredBackgroundLimit
      ) {
        // Mismatch on EITHER axis against what this process was built for. Claiming
        // the declared pair is safe ONLY if the pool is idle: LOCK_NB-sweep every slot
        // across both sizes. If any is held, an out-of-identity process is live.
        const hi = Math.max(sentinel.size, declaredSize);
        const probeFds: number[] = [];
        let allFree = true;
        for (let i = 0; i < hi; i++) {
          const fd = openSync(slotFile(i), "w");
          probeFds.push(fd);
          if (!flockTry(fd)) {
            allFree = false;
            break;
          }
        }
        if (!allFree) {
          for (const fd of probeFds) closeSync(fd);
          // Live pool, different pair → ADOPT the live one for this instance.
          //
          // The pool's identity is host state, not a per-process belief, and this
          // process is not entitled to overrule it. Every holder is sweeping the
          // sentinel's slot set, so joining them is the one choice under which the
          // bound holds and the reserved floor sits where everyone else thinks it does;
          // imposing the declared pair here is exactly the silent overcommit / floor
          // break the sentinel exists to prevent.
          //
          // This is NOT a fault to fail on. The host runs many checkouts at once and a
          // pool's size is derived from code, so any commit that moves the budget makes
          // every OTHER checkout's live pool "wrong" — a normal, transient, and
          // self-resolving condition. It used to throw here, which turned one such
          // commit into a host-wide outage: every build on the box died at its first
          // host grant, in both directions, until the pool happened to be idle at the
          // right instant. The declared pair still takes effect — the next acquire that
          // finds the pool idle writes it (the branch below) — it just no longer costs
          // an outage to get there.
          if (
            size !== sentinel.size ||
            backgroundLimit !== sentinel.backgroundLimit
          ) {
            console.warn(
              `createHostSemaphore(${name}): pool is live at ` +
                `${sentinel.size}:${sentinel.backgroundLimit} but this process was built for ` +
                `${declaredSize}:${declaredBackgroundLimit} — adopting the live identity ` +
                `(the declared one applies once the pool is idle).`,
            );
          }
          size = sentinel.size;
          backgroundLimit = sentinel.backgroundLimit;
        } else {
          // Pool idle → claim the declared pair, drop the now-extra slot files (only
          // when shrinking `size`), release every probe fd.
          writeSentinelAtomic();
          for (let i = declaredSize; i < sentinel.size; i++) {
            rmSync(slotFile(i), { force: true });
          }
          for (const fd of probeFds) closeSync(fd);
        }
      } else {
        // The sentinel names the declared pair — this instance may have been sweeping
        // an adopted one; the pool has since converged back.
        size = declaredSize;
        backgroundLimit = declaredBackgroundLimit;
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
    slots.ensure();
    const kept: number[] = [];
    for (const i of order) {
      const fd = openSync(slotFile(i), "w");
      if (kept.length < limit && flockTry(fd)) {
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
    const readers = children.map((child, i) =>
      awaitGranted(child.stdout, name).then(() => i),
    );

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

  async function acquireShare(
    max: number,
    hooks?: AcquireHooks,
  ): Promise<HostShare> {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(
        `acquireShare: max must be a positive integer, got ${max}`,
      );
    }
    const lane: Lane = hooks?.lane ?? "background";
    const t0 = performance.now();
    await ensureSizeIdentity();
    // AFTER the reconcile, never before: it is what settles which slot set this
    // acquire is entitled to sweep, so a window derived ahead of it could aim at the
    // wrong indices for the whole call.
    const order = laneOrder(lane);
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
        const turnstile = turnstileFile();
        let turnstileFd: number | undefined = openSync(turnstile, "w");
        let turnstileChild: WaitChild | undefined;
        if (!flockTry(turnstileFd)) {
          closeSync(turnstileFd);
          turnstileFd = undefined;
          turnstileChild = spawnWait(turnstile);
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

    liveSize: () => size,

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
async function awaitGranted(
  stream: ReadableStream<Uint8Array>,
  name: string,
): Promise<void> {
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

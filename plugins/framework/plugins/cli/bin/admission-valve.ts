import { statSync, watch } from "node:fs";
import { join } from "node:path";
import {
  FRESHNESS_LEASE_MS,
  isUnderDuress,
  LATCH_FILENAME,
  MEMO_TTL_MS,
  readDuress,
} from "@plugins/infra/plugins/duress/plugins/latch/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import type { Lane } from "@plugins/infra/plugins/host-admission/core";
import { buildProfilerStart } from "./profiler";

// Duress-aware admission valve (Piece 2 of
// research/2026-07-11-global-fleet-memory-admission-duress-valve.md): while
// the host duress latch is fresh — the cluster sentinel declared "the box is
// in trouble" (compressor thrash, pg pressure, load) — background-lane builds
// are held before they queue for their host grant. Already-running builds
// finish untouched. The hold sits BEFORE `withHostGrant`'s queue.
//
// A build can also enter that queue while the host is CALM and sit parked in
// it while duress trips. The closure-based grant API has no release-and-requeue
// seam, so the caller closes that window itself: it re-checks duress ONCE the
// grant is held and, if it is fresh, returns a sentinel from the closure (which
// releases the share via withHostGrant's finally) and re-holds here. That
// decision is `shouldRequeue` below — the caller supplies the hold's outcome so
// a fail-open hold never requeues (see gap (a) in
// research/2026-07-12-global-host-admission-memory-dimension.md).
//
// Waiting is event-driven, never a poll loop: one fs.watch on ~/.singularity
// scoped to the latch filename (catches clearDuress's unlink AND refresh's
// mtime bump) plus a single computed deadline timer at latch mtime +
// FRESHNESS_LEASE_MS (the lease guarantees a stale latch self-clears, so the
// deadline is a real wake condition). Every wake re-checks; a refresh
// advances the next deadline.

/**
 * Max time the valve may hold one build before proceeding anyway (fail-open).
 * A stuck latch must not stop deploys forever; the lease already self-clears
 * a dead sentinel in 60 s, so reaching this bound means the sentinel has been
 * live-refreshing duress for 30 straight minutes — proceed loudly and let a
 * human see the line. Default per the plan doc
 * (research/2026-07-11-global-fleet-memory-admission-duress-valve.md, D7).
 */
export const MAX_VALVE_HOLD_MS = 30 * 60_000;

/**
 * Grace added to the lease deadline so the timer fires just after the lease
 * lapses, not racing it.
 */
const LEASE_EPSILON_MS = 500;

/**
 * Does the valve gate this build? Only background-lane (agent) builds. The
 * interactive lane (main — a human is blocked) is never held, and per the
 * adopted v1 decision main's detached auto-build (SINGULARITY_BUILD_DETACHED,
 * spawned by build/run-build.ts) also passes. Push never reaches the valve —
 * it holds the reserved push slot, not a build grant.
 */
export function valveGates(
  lane: Lane,
  // Index-signature shape, not a named-prop literal: ProcessEnv declares no
  // named properties, so a weak object type here rejects `process.env` at
  // the production call site (TS2559).
  env: { readonly [key: string]: string | undefined },
): boolean {
  return lane === "background" && !env.SINGULARITY_BUILD_DETACHED;
}

/** Why a hold ended: the latch cleared/lapsed, or the fail-open bound tripped. */
export type HoldOutcome = "cleared" | "fail-open";

/**
 * Injected seams so the decision loop is pure logic under test (no real
 * latch, no flock, no timers). Production uses `createValveDeps()`.
 */
export interface ValveDeps {
  isUnderDuress(): boolean;
  /** Latch trip cause for the hold line, null when unreadable/absent. */
  duressReason(): string | null;
  /**
   * Sleep until the next re-check is worthwhile (latch event or lease
   * deadline), at most `maxWaitMs`. Event-driven — see module comment.
   */
  waitForWake(maxWaitMs: number): Promise<void>;
  now(): number;
  onHoldStart(reason: string | null): void;
  onHoldEnd(outcome: HoldOutcome): void;
}

/**
 * Hold until the host is out of duress (or the fail-open bound trips), then
 * return how the hold ended — the caller proceeds to queue for its host grant.
 * Not gated (or not under duress) ⇒ returns `"cleared"` immediately: there was
 * nothing to wait out, which is the same admission decision as a hold whose
 * latch cleared.
 */
export async function holdThroughValve(
  opts: { gated: boolean },
  deps: ValveDeps = createValveDeps(),
): Promise<HoldOutcome> {
  if (!opts.gated || !deps.isUnderDuress()) return "cleared";

  // Wall-clock start of the hold; the fail-open bound is measured from here.
  const firstHoldAt = deps.now();
  deps.onHoldStart(deps.duressReason());
  let outcome: HoldOutcome = "cleared";
  while (deps.isUnderDuress()) {
    const remainingMs = firstHoldAt + MAX_VALVE_HOLD_MS - deps.now();
    if (remainingMs <= 0) {
      outcome = "fail-open";
      break;
    }
    await deps.waitForWake(remainingMs);
  }
  deps.onHoldEnd(outcome);
  return outcome;
}

/**
 * The post-acquire re-check decision (gap (a)): having acquired the host grant,
 * should the holder release it and re-hold at the valve rather than start its
 * heavy section?
 *
 * TERMINATION is the property this predicate exists to protect. After a
 * `fail-open` hold the valve returns IMMEDIATELY while duress is still fresh —
 * so re-checking duress on that path would spin the caller's retry loop forever
 * (hold returns → duress fresh → requeue → hold returns → …). A fail-open hold
 * has already decided "proceed anyway; a stuck latch must not stop deploys
 * forever", and that decision must survive the re-check.
 */
export function shouldRequeue(
  gated: boolean,
  outcome: HoldOutcome,
  underDuress: boolean,
): boolean {
  return gated && outcome !== "fail-open" && underDuress;
}

/** Production deps: the real latch, fs.watch wake, profiler span, console. */
export function createValveDeps(): ValveDeps {
  // One hold is always closed before the next opens (holds never nest), so a
  // single slot for the open span suffices.
  let endHoldSpan: (() => void) | undefined;
  return {
    isUnderDuress,
    duressReason: () => readDuress()?.reason ?? null,
    waitForWake: waitForLatchWake,
    now: Date.now,
    onHoldStart: (reason) => {
      console.log(
        `build admission held: host under duress${reason ? ` (${reason})` : ""} — waiting for clear...`,
      );
      endHoldSpan = buildProfilerStart("duressHold", "build:queue", "held: host under duress");
    },
    onHoldEnd: (outcome) => {
      endHoldSpan?.();
      endHoldSpan = undefined;
      if (outcome === "fail-open") {
        console.log(
          `build admission valve: held ${Math.round(MAX_VALVE_HOLD_MS / 60_000)} min — proceeding anyway (fail-open: a stuck latch must not stop deploys forever)`,
        );
      } else {
        console.log("build admission released: duress cleared");
      }
    },
  };
}

/**
 * Sleep until the latch plausibly changed state, at most `maxWaitMs`:
 * fs.watch on ~/.singularity scoped to the latch filename, plus one deadline
 * timer at latch mtime + lease (+ε). When the latch is already gone or its
 * lease already lapsed, the latch's in-process stat memo may still report
 * duress for up to MEMO_TTL_MS — wait that long instead of spinning; the memo
 * converges within it. Spurious wakes are harmless (the caller re-checks).
 */
function waitForLatchWake(maxWaitMs: number): Promise<void> {
  return new Promise((resolve) => {
    let leaseLapsesInMs: number;
    try {
      leaseLapsesInMs =
        statSync(join(SINGULARITY_DIR, LATCH_FILENAME)).mtimeMs +
        FRESHNESS_LEASE_MS +
        LEASE_EPSILON_MS -
        Date.now();
    } catch (err) {
      if (!(err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT")) throw err;
      leaseLapsesInMs = 0; // latch vanished between check and stat
    }
    const waitMs = Math.min(leaseLapsesInMs > 0 ? leaseLapsesInMs : MEMO_TTL_MS, maxWaitMs);

    const watcher = watch(SINGULARITY_DIR, (_event, filename) => {
      // A null filename is a platform edge; wake and let the caller re-check.
      if (filename === null || filename === LATCH_FILENAME) done();
    });
    const timer = setTimeout(done, waitMs);
    function done(): void {
      clearTimeout(timer);
      watcher.close();
      resolve();
    }
  });
}

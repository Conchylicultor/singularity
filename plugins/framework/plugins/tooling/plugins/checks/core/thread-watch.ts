import type {
  StackSample,
  StackSampler,
} from "@plugins/infra/plugins/stack-sampler/core";
import {
  createOwnerTally,
  ownerOf,
  repoRoots,
  type OwnerShare,
  type OwnerTally,
} from "./thread-attribution";

// A check run is ~100 checks on ONE JS thread. In every uncached full pass on
// 2026-09-10/11 the last check started ~1 s in and then nothing settled for
// another 6–14 s, after which ~100 checks settled within ~120 ms of each other.
// A wall-clock timer running in that window measures the process, not what it
// waits on — which is how fork-schema-drift's 5 s connect timed out against a
// healthy Postgres. This watch is the instrument: it records every stretch the
// thread could not run a timer, and from stack samples, WHO held it.
// Design and measured culprits: the wiki track page "Check pass speed"
// (`read_page` block-c0e3f7dd-4943-432d-a631-d864fe623fe7).

/**
 * Tick cadence. Frequent enough that a tick's lateness is a sharp measure of a
 * block, rare enough that the tick itself (a drain and a few attributions) is
 * noise — its cost is reported as `selfMs` on every run, so this claim is
 * checked rather than assumed.
 */
export const TICK_MS = 50;

/**
 * A tick late by at least this much is a stall. 1 s is a fifth of the shortest
 * wall-clock timeout a check has actually failed on (fork-schema-drift's 5 s
 * connect), so anything a timer in a check could notice is counted.
 */
export const STALL_MS = 1_000;

/** Owners a stall keeps in full detail (the transcript's depth). */
const STALL_OWNERS = 5;

/** Owners the whole-run table keeps. */
const RUN_OWNERS = 10;

/** The two in-flight sets the progress run already keeps. */
export interface InFlight {
  running: readonly string[];
  bootstrap: readonly string[];
}

/** One stretch where the thread could not run a timer for ≥ `STALL_MS`. */
export interface ThreadStall {
  /**
   * From the watch opening to the tick BEFORE the stall — the last instant the
   * thread was known free, i.e. when the stall began.
   */
  offsetMs: number;
  /** Tick to tick: the window this stall's samples were drained from. */
  durationMs: number;
  /**
   * How late the tick fired (`durationMs − TICK_MS`): the part the thread was
   * KNOWN to be busy. The threshold, the longest, the totals and every overlap
   * are measured on this, never on `durationMs`.
   */
  lateMs: number;
  /**
   * Every check in flight at any point in this stall's window: those running
   * at the previous tick, plus every one that started since. Not the tick's
   * snapshot alone — a check can start and begin blocking in the same turn,
   * before any tick sees it, and a full pass starts ~100 checks in one burst,
   * so the snapshot would come back empty for exactly the stall this exists to
   * explain. The WHOLE list: it is the only link from a `shared` owner — a
   * helper whose caller the sample lost — back to the checks that could have
   * called it.
   */
  running: string[];
  bootstrap: string[];
  samples: number;
  owners: OwnerShare[];
}

/** The watch's verdict on the run, handed back by `ProgressRun.finish()`. */
export interface ThreadSummary {
  /**
   * The latest any tick fired, stall or not. Written even when nothing stalled:
   * a run whose longest late tick is 300 ms rules out "one long block" as the
   * explanation for slow checks, which is evidence too.
   */
  longestLateMs: number;
  stallCount: number;
  /** Σ `lateMs` over the stalls. */
  stalledMs: number;
  /** Every sample drained over the run, stall or not. */
  samples: number;
  /**
   * Samples per second, measured inside stall windows only — where the thread
   * is busy by definition. The JSC rate is not fixed (~40 Hz in the planning
   * probe, ~230 Hz in health-monitor), so it is measured, never assumed. Null
   * when no stall carried a sample: there is then nothing to measure it on,
   * and the tables report shares only.
   */
  rateHz: number | null;
  /** Time spent inside the watch's own tick handler. */
  selfMs: number;
  /**
   * Who used the thread over the WHOLE run, not only inside stalls. Work that
   * yields between pieces never trips a stall but still uses the thread up —
   * and it is why durations look inflated. `ms` is `samples / rateHz`, null
   * without a rate.
   */
  owners: Array<OwnerShare & { ms: number | null }>;
  /** Who held the thread across every stall window together. */
  stallOwners: OwnerShare[];
  stalls: ThreadStall[];
}

/** The pure state `stepWatch` advances. Nothing here reads a clock. */
export interface WatchState {
  readonly openedAt: number;
  readonly roots: readonly string[];
  lastTickAt: number;
  /**
   * Everything in flight at some point since `lastTickAt`: the sets at that
   * tick, grown by `noteStarted`. A stall's `running` / `bootstrap`.
   */
  window: { running: Set<string>; bootstrap: Set<string> };
  longestLateMs: number;
  stalls: ThreadStall[];
  /** Each stall's known-busy window `[due, fired]`, for `overlapMs`. */
  windows: Array<{ from: number; to: number }>;
  run: OwnerTally;
  stalled: OwnerTally;
  stallWindowMs: number;
  selfMs: number;
}

export function createWatchState(
  openedAt: number,
  roots: readonly string[],
  inFlight: InFlight,
): WatchState {
  return {
    openedAt,
    roots,
    lastTickAt: openedAt,
    window: windowFrom(inFlight),
    longestLateMs: 0,
    stalls: [],
    windows: [],
    run: createOwnerTally(roots),
    stalled: createOwnerTally(roots),
    stallWindowMs: 0,
    selfMs: 0,
  };
}

function windowFrom(inFlight: InFlight): WatchState["window"] {
  return {
    running: new Set(inFlight.running),
    bootstrap: new Set(inFlight.bootstrap),
  };
}

/**
 * A check (or bootstrap phase) entered its body. Recorded into the current
 * window so the next stall names it even if no tick ran between its start and
 * the block — see `ThreadStall.running`.
 */
export function noteStarted(
  state: WatchState,
  kind: keyof InFlight,
  id: string,
): void {
  state.window[kind].add(id);
}

/**
 * One tick, as a pure step over `(state, now, samples)`: attribute every
 * drained sample into the whole-run tally, and if this tick fired `STALL_MS`
 * late, close a stall owned by THIS batch — after a block, the late tick gets
 * exactly the samples taken during it, since the previous tick drained the
 * rest (health-monitor relies on the same property).
 *
 * `inFlight` is read at every tick to seed the next window, so the next stall's
 * `running` starts from the set at the last instant the thread was free —
 * including a late tick, which is the moment between two back-to-back blocks —
 * and grows by every `noteStarted` until it closes.
 */
export function stepWatch(
  state: WatchState,
  now: number,
  samples: readonly StackSample[],
  inFlight: () => InFlight,
): ThreadStall | null {
  const gap = now - state.lastTickAt;
  const lateMs = Math.max(0, gap - TICK_MS);
  state.longestLateMs = Math.max(state.longestLateMs, lateMs);

  const batch = lateMs >= STALL_MS ? createOwnerTally(state.roots) : null;
  for (const sample of samples) {
    const owner = ownerOf(sample.frames, state.roots);
    state.run.add(owner, sample.frames);
    if (batch) {
      batch.add(owner, sample.frames);
      state.stalled.add(owner, sample.frames);
    }
  }

  let stall: ThreadStall | null = null;
  if (batch) {
    stall = {
      offsetMs: Math.round(state.lastTickAt - state.openedAt),
      durationMs: Math.round(gap),
      lateMs: Math.round(lateMs),
      running: [...state.window.running],
      bootstrap: [...state.window.bootstrap],
      samples: samples.length,
      owners: batch.top(STALL_OWNERS),
    };
    state.stalls.push(stall);
    state.windows.push({ from: state.lastTickAt + TICK_MS, to: now });
    state.stallWindowMs += gap;
  }

  state.lastTickAt = now;
  state.window = windowFrom(inFlight());
  return stall;
}

/** Length of `[a, b] ∩ [from, to]`. */
function intersect(
  window: { from: number; to: number },
  from: number,
  to: number,
): number {
  return Math.max(0, Math.min(window.to, to) - Math.max(window.from, from));
}

/**
 * How much of `[from, to]` fell inside stalls: every recorded stall, plus the
 * CURRENT gap once it is already over `STALL_MS`. The second part is not an
 * edge case — a check can settle in the same event-loop turn a block ends,
 * before the late tick has run, and without it that check's `stalledMs` would
 * miss the very stall that inflated it.
 */
export function overlapMs(
  state: WatchState,
  from: number,
  to: number,
  now: number,
): number {
  let total = 0;
  for (const window of state.windows) total += intersect(window, from, to);
  const due = state.lastTickAt + TICK_MS;
  if (now - due >= STALL_MS)
    total += intersect({ from: due, to: now }, from, to);
  return Math.round(total);
}

/** The summary `finish()` hands back — a snapshot, safe to keep. */
export function summarizeWatch(state: WatchState): ThreadSummary {
  const stallSamples = state.stalled.samples;
  const rateHz =
    stallSamples > 0 && state.stallWindowMs > 0
      ? stallSamples / (state.stallWindowMs / 1000)
      : null;
  return {
    longestLateMs: Math.round(state.longestLateMs),
    stallCount: state.stalls.length,
    stalledMs: state.stalls.reduce((sum, stall) => sum + stall.lateMs, 0),
    samples: state.run.samples,
    rateHz: rateHz === null ? null : Math.round(rateHz * 10) / 10,
    selfMs: Math.round(state.selfMs),
    owners: state.run.top(RUN_OWNERS).map((share) => ({
      ...share,
      ms: rateHz === null ? null : Math.round((share.samples / rateHz) * 1000),
    })),
    stallOwners: state.stalled.top(STALL_OWNERS),
    stalls: [...state.stalls],
  };
}

/** A live watch: the overlap query `checkEnded` asks, and the stop `finish()` calls. */
export interface ThreadWatch {
  overlapMs(from: number, to: number): number;
  /** A check or bootstrap phase started — see `noteStarted`. */
  noteStarted(kind: keyof InFlight, id: string): void;
  /**
   * Stop the timer, run one last tick (so a block that ends the run is still
   * counted, and still reaches `onStall` before the summary is written), and
   * return the summary. A second call returns the same summary.
   */
  stop(): ThreadSummary;
}

/**
 * Open the watch: the thin timer + sampler shell around `stepWatch`.
 *
 * Its lifetime is the progress run's (`openProgressRun` opens it, `finish()`
 * stops it), so it covers bootstrap too — `load-checks` alone takes ~2.5 s —
 * and the runner holds no second handle to forget at one of its early exits.
 *
 * `sampler` is a parameter, not claimed here: the progress run claims the
 * process's one JSC sampler, and a test hands in a fake. `roots` defaults to
 * the repo's; a probe outside the checkout passes its own.
 */
export function openThreadWatch(args: {
  /** The run's own `performance.now()` start — every `offsetMs` counts from it. */
  startedAt: number;
  inFlight: () => InFlight;
  onStall: (stall: ThreadStall) => void;
  sampler: StackSampler;
  roots?: readonly string[];
}): ThreadWatch {
  const { sampler } = args;
  // The sampler cannot be stopped, so anything left in its buffer predates this
  // run; drained now, it is never mistaken for this run's first batch.
  sampler.drain();
  const state = createWatchState(
    args.startedAt,
    args.roots ?? repoRoots(),
    args.inFlight(),
  );

  const tick = (): void => {
    const startedAt = performance.now();
    const stall = stepWatch(state, startedAt, sampler.drain(), args.inFlight);
    if (stall) args.onStall(stall);
    state.selfMs += performance.now() - startedAt;
  };

  // `.unref()` for the heartbeat's reason: this timer exists to observe the
  // run, never to be why the process stays alive.
  const timer = setInterval(tick, TICK_MS);
  timer.unref();

  let summary: ThreadSummary | null = null;
  return {
    overlapMs: (from, to) => overlapMs(state, from, to, performance.now()),
    noteStarted: (kind, id) => noteStarted(state, kind, id),
    stop() {
      if (summary) return summary;
      clearInterval(timer);
      tick();
      summary = summarizeWatch(state);
      return summary;
    },
  };
}

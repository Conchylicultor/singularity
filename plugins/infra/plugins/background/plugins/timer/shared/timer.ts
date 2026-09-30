import {
  RECENT_RUNS_MAX,
  type BackgroundEntryDraft,
  type BackgroundRun,
  type BackgroundScope,
} from "@plugins/infra/plugins/background/plugins/catalog/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";

/**
 * What an author declares. Shared by both runtimes; each runtime's
 * `defineTimer` adds only what it alone knows (where it runs, who declared it).
 */
export interface TimerSpec {
  /** Stable code name, unique per process (`jobs.stuck-lock-sweep`). */
  name: string;
  /** One present-tense sentence a person reads: what each tick does and why. */
  description: string;
  /** The period. Also the delay before the first tick unless `immediate`. */
  everyMs: number;
  /**
   * One tick. Sync or async; ticks may overlap if one outlives the period
   * (the same as the `setInterval` it replaces). A throw is recorded as a
   * failed run and surfaced loudly (see the runtime's `defineTimer`) — handle
   * a failure you EXPECT inside `run`, as before.
   */
  run: () => void | Promise<void>;
  /** Tick once as soon as `start()` is called, then every `everyMs`. */
  immediate?: boolean;
  /** Do not keep the process alive for this timer. */
  unref?: boolean;
  /**
   * `span` (default): each tick is a `runTracked("timer:<name>")` span.
   * `invisible`: no span at all — ONLY for a sampler that measures the
   * profiler's own host (spanning it would re-feed what it measures).
   */
  profile?: "span" | "invisible";
}

/** A declared timer: mount it in `register: [...]`, then `start()` it where the
 * interval used to be started. */
export interface Timer {
  readonly name: string;
  readonly _kind: "timer";
  readonly _factory: "defineTimer";
  readonly _doc: { label: string; detail: string };
  register(): void;
  /** Start ticking. Throws if the timer was never registered (it would run
   * without appearing in the catalog) or if its runtime says it must not run
   * here. Idempotent while running. */
  start(): void;
  /** Stop ticking (idempotent). A tick in flight finishes. */
  stop(): void;
  /** Whether it is ticking. */
  readonly running: boolean;
}

/** How a runtime hosts timers: where they run, and what a failure does. */
export interface TimerRuntime {
  scope: BackgroundScope;
  /** Whether this process may run a timer declared with `spec`. */
  runsHere: boolean;
  /** The plugin declaring it, read inside `register()` (null when unknown). */
  declaredIn: () => string | null;
  /**
   * After a failed tick is recorded: make it loud. The server rethrows (an
   * unhandled rejection the reports plugin files); central, which has no
   * reports funnel, logs it — the catalog shows the failure either way.
   */
  onFailure: (name: string, err: unknown) => void;
  /** The catalog's change signal for this runtime. */
  changed: (name: string) => void;
}

interface TimerState {
  spec: TimerSpec;
  runtime: TimerRuntime;
  declaredIn: string | null;
  handle: ReturnType<typeof setInterval> | null;
  inFlightSince: Date | null;
  /** Newest first, at most RECENT_RUNS_MAX. */
  ring: BackgroundRun[];
  runs: number;
  failures: number;
  lastSuccessAt: Date | null;
  lastNotifiedAt: number;
}

// Registered timers, per process. Bounded by the declared set.
const timers = new Map<string, TimerState>();

// A per-second sampler must not push the catalog every second: a change is
// pushed when a run's outcome differs from the previous one (a failure shows
// at once), and otherwise at most once a minute per timer.
const QUIET_NOTIFY_MS = 60_000;

export function defineTimerIn(spec: TimerSpec, runtime: TimerRuntime): Timer {
  if (!(spec.everyMs > 0)) {
    throw new Error(`[timer] ${spec.name}: everyMs must be > 0`);
  }
  const state: TimerState = {
    spec,
    runtime,
    declaredIn: null,
    handle: null,
    inFlightSince: null,
    ring: [],
    runs: 0,
    failures: 0,
    lastSuccessAt: null,
    lastNotifiedAt: 0,
  };

  const tick = async (): Promise<void> => {
    const startedAt = new Date();
    const t0 = performance.now();
    state.inFlightSince = startedAt;
    let error: unknown = null;
    let failed = false;
    try {
      await spec.run();
    } catch (err) {
      failed = true;
      error = err;
    }
    state.inFlightSince = null;
    record(state, {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      outcome: failed ? "failed" : "succeeded",
      durationMs: Math.round((performance.now() - t0) * 10) / 10,
      error: failed ? errorText(error) : null,
    });
    if (failed) runtime.onFailure(spec.name, error);
  };

  const fire = (): void => {
    // The one sanctioned interval body in the repo: every tick is a span
    // (or, for a declared self-measuring sampler, deliberately none).
    if (spec.profile === "invisible") {
      void tick();
    } else {
      void runTracked(`timer:${spec.name}`, tick);
    }
  };

  return {
    name: spec.name,
    _kind: "timer",
    _factory: "defineTimer",
    _doc: { label: spec.name, detail: spec.description },
    register() {
      if (timers.has(spec.name)) {
        throw new Error(`[timer] duplicate timer name: ${spec.name}`);
      }
      state.declaredIn = runtime.declaredIn();
      timers.set(spec.name, state);
    },
    start() {
      if (timers.get(spec.name) !== state) {
        throw new Error(
          `[timer] ${spec.name} started before it was registered — mount it in its plugin's \`register: [...]\` so it appears in Background activity`,
        );
      }
      if (!runtime.runsHere) {
        throw new Error(
          `[timer] ${spec.name} is declared main-only and cannot start in this backend`,
        );
      }
      if (state.handle !== null) return;
      if (spec.immediate) fire();
      state.handle = setInterval(fire, spec.everyMs);
      if (spec.unref) state.handle.unref();
      runtime.changed(spec.name);
    },
    stop() {
      if (state.handle === null) return;
      clearInterval(state.handle);
      state.handle = null;
      runtime.changed(spec.name);
    },
    get running() {
      return state.handle !== null;
    },
  };
}

function record(state: TimerState, run: BackgroundRun): void {
  const previous = state.ring[0];
  state.ring.unshift(run);
  if (state.ring.length > RECENT_RUNS_MAX) state.ring.length = RECENT_RUNS_MAX;
  state.runs += 1;
  if (run.outcome === "failed") state.failures += 1;
  else state.lastSuccessAt = new Date(run.finishedAt ?? run.startedAt);
  const now = Date.now();
  if (
    previous === undefined ||
    previous.outcome !== run.outcome ||
    now - state.lastNotifiedAt >= QUIET_NOTIFY_MS
  ) {
    state.lastNotifiedAt = now;
    state.runtime.changed(state.spec.name);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Every registered timer as a catalog entry. */
export function listTimerEntries(): BackgroundEntryDraft[] {
  return [...timers.values()].map((s) => {
    const inFlight: BackgroundRun | null =
      s.inFlightSince === null
        ? null
        : {
            startedAt: s.inFlightSince.toISOString(),
            finishedAt: null,
            outcome: "running",
            durationMs: null,
            error: null,
          };
    return {
      name: s.spec.name,
      description: s.spec.description,
      group: "Timers",
      trigger: { kind: "interval", everyMs: s.spec.everyMs },
      scope: s.runtime.scope,
      runsHere: s.runtime.runsHere,
      declaredIn: s.declaredIn,
      lastRun: inFlight ?? s.ring[0] ?? null,
      history: {
        runs: s.runs,
        failures: s.failures,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
      },
      canRunNow: false,
      internal: false,
      facts: [
        { label: "State", value: s.handle !== null ? "Ticking" : "Stopped" },
        {
          label: "Runs in",
          value: "This process, in memory — history resets when it restarts",
        },
      ],
    };
  });
}

/** One timer's recent runs, newest first (the one in flight first). */
export async function timerRecentRuns(name: string): Promise<BackgroundRun[]> {
  const s = timers.get(name);
  if (s === undefined) {
    throw new Error(`[timer] no timer named "${name}" is registered`);
  }
  const ring = [...s.ring];
  if (s.inFlightSince !== null) {
    ring.unshift({
      startedAt: s.inFlightSince.toISOString(),
      finishedAt: null,
      outcome: "running",
      durationMs: null,
      error: null,
    });
  }
  return ring;
}

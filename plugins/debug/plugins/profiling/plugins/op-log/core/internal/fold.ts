import type { OpKind, OpRecord, OpWait, RawOpRecord } from "./types";

// The fold: many append-only raw lines → one record per op. Pure and
// `now`-injected, so the live-bar synthesis is testable without a clock.

const EPOCH = new Date(0).toISOString();

// The closed set of known kinds, for validating a line's self-reported kind on
// the way in. A raw line is untrusted input — written by another process,
// possibly an older CLI — so a kind outside this set must not be cast through to
// `OpRecord.kind` where the type would then be lying. Falls back to "build",
// mirroring `markerInfoFromParsed`'s identical guard in worktree-op.ts.
const KNOWN_KINDS: readonly OpKind[] = ["build", "push", "check"];

function coerceKind(raw: OpKind | undefined): OpKind {
  return raw !== undefined && KNOWN_KINDS.includes(raw) ? raw : "build";
}

/** Sum a wait list into the derived scalar the read model exposes as `waitMs`. */
export function sumWaits(waits: OpWait[]): number {
  return waits.reduce((total, w) => total + w.durationMs, 0);
}

function parseMs(iso: string | undefined | null, fallbackMs: number): number {
  if (iso == null) return fallbackMs;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? fallbackMs : ms;
}

/** The three raw lines one op can emit, collected. */
interface OpGroup {
  requested?: RawOpRecord;
  granted?: RawOpRecord;
  terminal?: RawOpRecord;
}

/**
 * Group raw lines by `opId`. Last write of each phase wins, which is what makes
 * `requested` re-stampable (each wait open/close appends a fresher identity
 * line) and makes interleaved concurrent writers a non-issue: the file is a
 * shared append log, so two ops' lines arrive interleaved, but grouping is by id
 * and never by adjacency.
 */
export function groupByOpId(raw: RawOpRecord[]): Map<string, OpGroup> {
  const byId = new Map<string, OpGroup>();
  for (const r of raw) {
    const g = byId.get(r.opId) ?? {};
    if (r.phase === "requested") g.requested = r;
    else if (r.phase === "granted") g.granted = r;
    else g.terminal = r;
    byId.set(r.opId, g);
  }
  return byId;
}

// Identity fields live on the `requested` record (written up-front) and are
// repeated on the terminal. Resolve them from whichever record we have.
function identityOf(base: RawOpRecord): Omit<
  OpRecord,
  | "requestedAt"
  | "grantedAt"
  | "completedAt"
  | "waits"
  | "waitMs"
  | "holdMs"
  | "totalMs"
  | "outcome"
  | "interrupted"
  | "steps"
> {
  return {
    opId: base.opId,
    kind: coerceKind(base.kind),
    opSlug: base.opSlug ?? null,
    branch: base.branch ?? base.opId,
    conversationId: base.conversationId ?? null,
    worktree: base.worktree ?? null,
    lane: base.lane ?? null,
    mode: base.mode ?? null,
    buildId: base.buildId ?? null,
  };
}

function normalizeTerminal(r: RawOpRecord, requested: RawOpRecord | undefined): OpRecord {
  // A terminal record carries its own identity, but a field the writer only
  // learned up-front (lane, conversationId) may be absent on an older/leaner
  // terminal — fall back to the `requested` line rather than nulling it out.
  // Merge the RAW lines before normalizing: `identityOf` resolves absent fields
  // to null, so merging its OUTPUT would let the terminal's nulls clobber the
  // requested line's real values. A key the terminal genuinely carries (even as
  // an explicit null) still wins — spread only copies present keys.
  const identity = identityOf(requested ? { ...requested, ...r } : r);
  const waits = r.waits ?? [];
  return {
    ...identity,
    requestedAt: r.requestedAt ?? requested?.requestedAt ?? EPOCH,
    grantedAt: r.grantedAt ?? r.requestedAt ?? EPOCH,
    completedAt: r.completedAt ?? null,
    waits,
    waitMs: sumWaits(waits),
    holdMs: r.holdMs ?? 0,
    totalMs: r.totalMs ?? 0,
    outcome: r.outcome ?? "error",
    interrupted: r.interrupted ?? false,
    steps: r.steps ?? [],
  };
}

/**
 * An in-flight op's CURRENT wait list: every closed wait, plus the one still open
 * clocked against `now`.
 *
 * Used by BOTH in-flight branches — pre- and post-`granted` — and that sharing is
 * the point. The two branches having their own copies is exactly how the
 * post-`granted` waits came to be dropped: the granted branch froze `waits` at
 * whatever `markGranted()` stamped and ignored `openWait` entirely.
 *
 * `requested` is RE-STAMPED on every wait open/close while `granted` is written
 * once, so the freshest `requested` is normally a superset of the `granted`
 * snapshot. But a `requested` that was never re-stamped carries `waits: []` —
 * PRESENT and empty — so `requested.waits ?? granted.waits` would let that empty
 * list clobber a populated `granted` one and silently drop the wait.
 *
 * A wait list only ever APPENDS (a closed wait is never removed, and an open one
 * is closed in place), so the longer list is by construction the newer one. That
 * invariant picks the right list with no null-ish hole, and can never lose a
 * segment either way round.
 */
function liveWaitsOf(
  requested: RawOpRecord,
  granted: RawOpRecord | undefined,
  requestedMs: number,
  now: number,
): OpWait[] {
  const fromRequested = requested.waits ?? [];
  const fromGranted = granted?.waits ?? [];
  const waits = [
    ...(fromRequested.length >= fromGranted.length ? fromRequested : fromGranted),
  ];
  if (requested.openWait) {
    const openedMs = parseMs(requested.openWait.startedAt, requestedMs);
    waits.push({
      kind: requested.openWait.kind,
      startMs: requested.openWait.startMs,
      durationMs: Math.max(0, now - openedMs),
    });
  }
  return waits;
}

/**
 * Synthesize the live record for an op with no terminal line, clocking the open
 * interval against `now` — this is what makes the Gantt bars grow on refresh
 * without anything polling.
 */
function synthInFlight(
  requested: RawOpRecord,
  granted: RawOpRecord | undefined,
  now: number,
): OpRecord {
  const identity = identityOf(requested);
  const requestedMs = parseMs(requested.requestedAt, now);
  const waits = liveWaitsOf(requested, granted, requestedMs, now);

  if (granted) {
    // `markGranted()` means "the op stopped queuing for its ENTRY ticket and
    // began doing its own work". It does NOT mean "this op will never block
    // again" — and for two of the three kinds, the most diagnostically important
    // wait happens AFTER it:
    //
    //   push  — grants at the push mutex, then its nested rebased-checks
    //           subprocess queues for an interactive host-grant.
    //   build — grants at the build lock, does migrations/codegen for minutes,
    //           THEN hits the duress valve + host grant, possibly over several
    //           requeue cycles.
    //   check — grants at the host grant; nothing after.
    //
    // So the wait list keeps growing here, exactly as in the pre-grant branch.
    // Freezing it was what made a build parked 5 min in `host-grant` render as a
    // motionless "running" bar — the very failure this record exists to kill.
    const grantedMs = parseMs(granted.grantedAt, requestedMs);
    return {
      ...identity,
      requestedAt: requested.requestedAt ?? new Date(requestedMs).toISOString(),
      grantedAt: granted.grantedAt ?? new Date(grantedMs).toISOString(),
      completedAt: null,
      waits,
      waitMs: sumWaits(waits),
      holdMs: Math.max(0, now - grantedMs),
      totalMs: Math.max(0, now - requestedMs),
      // Stays "running" even while parked in a post-grant wait: the op HAS
      // started work, and "running, with a growing host-grant segment" is the
      // truthful description. Do NOT flip back to "waiting" — the Gantt maps
      // both to the same pulse treatment, so the flip would buy nothing and
      // would lie about the op having been admitted.
      outcome: "running",
      interrupted: false,
      steps: [],
    };
  }

  return {
    ...identity,
    requestedAt: requested.requestedAt ?? new Date(requestedMs).toISOString(),
    // No grant yet — the op has not started work, so there is no hold to clock.
    grantedAt: requested.requestedAt ?? new Date(requestedMs).toISOString(),
    completedAt: null,
    waits,
    waitMs: sumWaits(waits),
    holdMs: 0,
    totalMs: Math.max(0, now - requestedMs),
    outcome: "waiting",
    interrupted: false,
    steps: [],
  };
}

/**
 * Fold the op-log's raw lines into one `OpRecord` per op.
 *
 * - A terminal (`completed`) record ALWAYS wins — it is the writer's own final
 *   word, including a reconciler-stamped interrupted close.
 * - `requested` only ⇒ synthetic `"waiting"`, wait growing against `now`.
 * - `requested` + `granted` ⇒ synthetic `"running"`, waits frozen, hold growing.
 *
 * `now` is INJECTED, never read inside: the live synthesis is the whole reason
 * this function is interesting, and a hidden `Date.now()` would make it
 * untestable.
 */
export function foldOpRecords(raw: RawOpRecord[], now: number): OpRecord[] {
  const out: OpRecord[] = [];
  for (const g of groupByOpId(raw).values()) {
    if (g.terminal) {
      out.push(normalizeTerminal(g.terminal, g.requested));
      continue;
    }
    // A `granted` with no `requested` carries no identity (the writer only ever
    // emits it after a `requested`), so there is nothing to render. Skip.
    if (!g.requested) continue;
    out.push(synthInFlight(g.requested, g.granted, now));
  }
  return out;
}

/**
 * The ops in `raw` that are in-flight with no terminal record — the reconciler's
 * candidate set. Exported so `finalizeOrphanedOps` and `foldOpRecords` agree on
 * what "orphaned" means by construction rather than by two parallel loops.
 */
export function orphanedOps(raw: RawOpRecord[]): OpGroup[] {
  const out: OpGroup[] = [];
  for (const g of groupByOpId(raw).values()) {
    if (g.terminal || !g.requested) continue;
    out.push(g);
  }
  return out;
}

export type { OpGroup };

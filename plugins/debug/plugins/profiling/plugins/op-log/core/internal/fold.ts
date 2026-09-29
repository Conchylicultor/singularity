import { OP_KIND_IDS, type OpKind } from "@plugins/infra/plugins/worktree/core";
import type {
  LegacyOpenWait,
  OpEvent,
  OpFoldState,
  OpIdentity,
  OpLine,
  OpLiveTimes,
  OpRecord,
  OpSummary,
  OpWait,
  OpWaitSpan,
  OpenWait,
  RawOpRecord,
} from "./types";

// The reducer: append-only lines → one folded state per op → one read-model
// record. ONE reducer for every reader — the CLI's file reads (`await`, the
// build-lock waiter, the Gantt/stats endpoints) today, a DB ingester next — so
// "what state is this op in" has exactly one answer. Pure and `now`-injected, so
// the live synthesis is testable without a clock.
//
// Rules:
// - A terminal wins, and every line after it is ignored — duplicate reconciler
//   terminals are harmless.
// - A non-terminal v2 event applies only when `seq > lastSeq`, which makes
//   re-ingesting the same bytes idempotent.
// - A legacy snapshot line (a pre-v2 CLI) folds with the old snapshot
//   semantics: last `requested` stamp wins for identity and the open wait, and
//   between re-stamps and the `granted` snapshot the LONGER wait list wins
//   (wait lists only append, so the longer one is by construction the newer).

const EPOCH = new Date(0).toISOString();

// A line's self-reported kind is untrusted input (another process, possibly an
// older CLI), so a kind outside the closed set must not be cast through to
// `OpRecord.kind` where the type would then be lying. Falls back to "build",
// mirroring `markerInfoFromParsed`'s identical guard in worktree-op.ts.
const KNOWN_KINDS: readonly OpKind[] = OP_KIND_IDS;

function coerceKind(raw: OpKind | undefined): OpKind {
  return raw !== undefined && KNOWN_KINDS.includes(raw) ? raw : "build";
}

/** Sum a wait list into the derived scalar the read model exposes as `waitMs`. */
export function sumWaits(waits: readonly OpWaitSpan[]): number {
  return waits.reduce((total, w) => total + w.durationMs, 0);
}

function parseMs(iso: string | null, fallbackMs: number): number {
  if (iso === null) return fallbackMs;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? fallbackMs : ms;
}

/** The state of an op no line has been applied to yet. */
export function emptyOpState(opId: string): OpFoldState {
  return {
    opId,
    identity: null,
    requestedAt: null,
    grantedAt: null,
    completedAt: null,
    waits: [],
    openWait: null,
    cycle: 0,
    lastSeq: 0,
    closedBy: null,
    outcome: null,
    interrupted: false,
    holdMs: 0,
    totalMs: 0,
    steps: [],
  };
}

/** Is this line a v2 event (vs a legacy snapshot)? */
export function isOpEvent(line: OpLine): line is OpEvent {
  return "e" in line;
}

/** Has this op written its terminal line? */
export function isTerminalState(state: OpFoldState): boolean {
  return state.closedBy !== null;
}

// ── v2 ──────────────────────────────────────────────────────────────────────

function applyV2(s: OpFoldState, ev: OpEvent): OpFoldState {
  if (ev.e === "completed") {
    const { summary } = ev;
    return {
      ...s,
      identity: {
        kind: coerceKind(summary.kind),
        opSlug: summary.opSlug,
        branch: summary.branch,
        conversationId: summary.conversationId,
        lane: summary.lane,
        mode: summary.mode,
        buildId: summary.buildId,
        pid: summary.pid,
      },
      requestedAt: summary.requestedAt,
      grantedAt: summary.grantedAt,
      completedAt: summary.completedAt,
      waits: summary.waits,
      openWait: null,
      cycle: summary.waits.reduce((c, w) => Math.max(c, w.cycle), s.cycle),
      lastSeq: Math.max(s.lastSeq, ev.seq),
      closedBy: ev.by,
      outcome: summary.outcome,
      interrupted: summary.interrupted,
      holdMs: summary.holdMs,
      totalMs: summary.totalMs,
      steps: summary.steps,
    };
  }

  if (ev.seq <= s.lastSeq) return s; // already applied — re-ingest is a no-op
  const next: OpFoldState = { ...s, lastSeq: ev.seq };
  switch (ev.e) {
    case "requested":
      next.identity = {
        kind: coerceKind(ev.kind),
        opSlug: ev.opSlug,
        branch: ev.branch,
        conversationId: ev.conversationId,
        lane: ev.lane,
        mode: ev.mode,
        buildId: ev.buildId,
        pid: ev.pid,
      };
      next.requestedAt = ev.at;
      return next;
    case "wait-start": {
      // The writer always closes a wait before opening the next; should one
      // still be open, close it here rather than lose the interval.
      if (s.openWait) next.waits = [...s.waits, abortedAt(s.openWait, ev.t)];
      next.openWait = {
        kind: ev.wait,
        startMs: ev.t,
        startedAt: ev.at,
        reason: ev.reason,
        cycle: ev.cycle,
      };
      return next;
    }
    case "wait-end":
      next.waits = [
        ...s.waits,
        {
          kind: ev.wait,
          startMs: ev.startMs,
          durationMs: ev.durationMs,
          reason: ev.reason,
          cycle: ev.cycle,
          result: ev.result,
        },
      ];
      next.openWait = null;
      return next;
    case "requeue":
      next.cycle = ev.cycle;
      return next;
    case "granted":
      next.grantedAt = ev.at;
      return next;
  }
}

function abortedAt(open: OpenWait, nowT: number): OpWait {
  return {
    kind: open.kind,
    startMs: open.startMs,
    durationMs: Math.max(0, nowT - open.startMs),
    reason: open.reason,
    cycle: open.cycle,
    result: "aborted",
  };
}

// ── legacy ──────────────────────────────────────────────────────────────────

function legacyWaits(waits: readonly OpWaitSpan[] | undefined): OpWait[] {
  return (waits ?? []).map((w) => ({
    kind: w.kind,
    startMs: w.startMs,
    durationMs: w.durationMs,
    reason: null,
    cycle: 0,
    result: null,
  }));
}

function legacyOpenWait(w: LegacyOpenWait | null | undefined): OpenWait | null {
  if (!w) return null;
  return {
    kind: w.kind,
    startMs: w.startMs,
    startedAt: w.startedAt,
    reason: null,
    cycle: 0,
  };
}

/**
 * Identity from a legacy line, falling back per field to what is already known.
 * Only a key the line genuinely carries (even as an explicit `null`) overrides —
 * a lean terminal that omits `lane` must not null out the `requested` line's.
 */
function legacyIdentity(r: RawOpRecord, known: OpIdentity | null): OpIdentity {
  return {
    kind: coerceKind(r.kind ?? known?.kind),
    opSlug: r.opSlug !== undefined ? r.opSlug : (known?.opSlug ?? null),
    branch: r.branch ?? known?.branch ?? r.opId,
    conversationId:
      r.conversationId !== undefined
        ? r.conversationId
        : (known?.conversationId ?? null),
    lane: r.lane !== undefined ? r.lane : (known?.lane ?? null),
    mode: r.mode !== undefined ? r.mode : (known?.mode ?? null),
    buildId: r.buildId !== undefined ? r.buildId : (known?.buildId ?? null),
    pid: known?.pid ?? null,
  };
}

/** The longer list wins — a wait list only appends, so it is the newer one. */
function longerWaits(current: OpWait[], candidate: OpWait[]): OpWait[] {
  return candidate.length >= current.length ? candidate : current;
}

function applyLegacy(s: OpFoldState, r: RawOpRecord): OpFoldState {
  switch (r.phase) {
    case "requested":
      // A re-stamp: the freshest identity and open wait win outright (the
      // latest `requested` line is the whole identity, as it always was).
      return {
        ...s,
        identity: legacyIdentity(r, null),
        requestedAt: r.requestedAt ?? s.requestedAt,
        waits: longerWaits(s.waits, legacyWaits(r.waits)),
        openWait: legacyOpenWait(r.openWait),
      };
    case "granted":
      return {
        ...s,
        // A granted line with no instant still flips the op to running,
        // clocked from its request, as the snapshot fold did.
        grantedAt: r.grantedAt ?? s.requestedAt ?? EPOCH,
        waits: longerWaits(s.waits, legacyWaits(r.waits)),
      };
    case "completed":
      return {
        ...s,
        identity: legacyIdentity(r, s.identity),
        requestedAt: r.requestedAt ?? s.requestedAt,
        grantedAt: r.grantedAt ?? r.requestedAt ?? null,
        completedAt: r.completedAt ?? null,
        // The terminal's OWN accumulated list — never the granted snapshot.
        waits: legacyWaits(r.waits),
        openWait: null,
        closedBy: r.interrupted === true ? "reconciler" : "self",
        outcome: r.outcome ?? "error",
        interrupted: r.interrupted ?? false,
        holdMs: r.holdMs ?? 0,
        totalMs: r.totalMs ?? 0,
        steps: r.steps ?? [],
      };
  }
}

// ── the reducer ─────────────────────────────────────────────────────────────

/**
 * Apply one line to one op's state. Pure: returns a new state (or the same one
 * when the line is ignored) and never mutates its input, so a store can load a
 * row, apply, compare and write back.
 */
export function applyOpEvent(
  state: OpFoldState | undefined,
  line: OpLine,
): OpFoldState {
  const s = state ?? emptyOpState(line.opId);
  if (isTerminalState(s)) return s; // the terminal wins; later lines are noise
  return isOpEvent(line) ? applyV2(s, line) : applyLegacy(s, line);
}

/**
 * Fold every line into one state per op. Grouping is by `opId`, never by
 * adjacency: the file is a shared append log, so ops' lines arrive interleaved.
 */
export function foldOpLines(lines: Iterable<OpLine>): Map<string, OpFoldState> {
  const byId = new Map<string, OpFoldState>();
  for (const line of lines)
    byId.set(line.opId, applyOpEvent(byId.get(line.opId), line));
  return byId;
}

// ── read model ──────────────────────────────────────────────────────────────

/** The closed waits plus the open one, clocked against `now`. */
function liveWaits(s: OpFoldState, requestedMs: number, now: number): OpWait[] {
  if (!s.openWait) return s.waits;
  const openedMs = parseMs(s.openWait.startedAt, requestedMs);
  return [
    ...s.waits,
    {
      kind: s.openWait.kind,
      startMs: s.openWait.startMs,
      durationMs: Math.max(0, now - openedMs),
      reason: s.openWait.reason,
      cycle: s.openWait.cycle,
      result: null,
    },
  ];
}

/**
 * The read-model record for one op, or `null` for a headless in-flight op (its
 * `requested` line was never seen, so there is no identity to render).
 *
 * - Terminal ⇒ the writer's frozen numbers.
 * - Not yet granted ⇒ synthetic `"waiting"`, total growing against `now`.
 * - Granted ⇒ synthetic `"running"`, hold growing — and the wait list keeps
 *   growing too: `granted` means "stopped queuing for the ENTRY ticket", not
 *   "will never block again" (a build's duress-valve / host-grant waits come
 *   minutes after its build lock). It does not flip back to `"waiting"`.
 *
 * `now` is INJECTED, never read inside.
 */
export function toOpRecord(s: OpFoldState, now: number): OpRecord | null {
  if (!s.identity) return null;
  const { pid, ...identity } = s.identity;
  const base = { opId: s.opId, ...identity, pid, cycle: s.cycle };

  if (s.closedBy !== null) {
    const requestedAt = s.requestedAt ?? EPOCH;
    return {
      ...base,
      requestedAt,
      grantedAt: s.grantedAt ?? requestedAt,
      completedAt: s.completedAt,
      waits: s.waits,
      waitMs: sumWaits(s.waits),
      openWait: null,
      holdMs: s.holdMs,
      totalMs: s.totalMs,
      outcome: s.outcome ?? "error",
      interrupted: s.interrupted,
      closedBy: s.closedBy,
      steps: s.steps,
    };
  }

  const requestedMs = parseMs(s.requestedAt, now);
  const requestedAt = s.requestedAt ?? new Date(requestedMs).toISOString();
  const waits = liveWaits(s, requestedMs, now);
  const inFlight = {
    ...base,
    requestedAt,
    completedAt: null,
    waits,
    waitMs: sumWaits(waits),
    openWait: s.openWait,
    totalMs: Math.max(0, now - requestedMs),
    interrupted: false,
    closedBy: null,
    // Steps accumulate in-process and land only on the terminal; a live bar
    // claims none rather than a stale subset.
    steps: [],
  };
  if (s.grantedAt !== null) {
    const grantedMs = parseMs(s.grantedAt, requestedMs);
    return {
      ...inFlight,
      grantedAt: s.grantedAt,
      holdMs: Math.max(0, now - grantedMs),
      outcome: "running",
    };
  }
  // No grant yet — no hold to clock.
  return { ...inFlight, grantedAt: requestedAt, holdMs: 0, outcome: "waiting" };
}

/** Every renderable op in a fold, as read-model records. */
export function toOpRecords(
  states: Iterable<OpFoldState>,
  now: number,
): OpRecord[] {
  const out: OpRecord[] = [];
  for (const s of states) {
    const rec = toOpRecord(s, now);
    if (rec) out.push(rec);
  }
  return out;
}

/**
 * Waited vs worked at `now` — the ONLY place these are computed, for every
 * surface. Durations are clamped at 0 (the writer's and the reader's clocks can
 * disagree).
 */
export function liveTimes(s: OpFoldState, now: number): OpLiveTimes {
  if (s.closedBy !== null) {
    const waitingMs = sumWaits(s.waits);
    return {
      elapsedMs: s.totalMs,
      waitingMs,
      workingMs: Math.max(0, s.totalMs - waitingMs),
      openWaitMs: 0,
    };
  }
  const requestedMs = parseMs(s.requestedAt, now);
  const elapsedMs = Math.max(0, now - requestedMs);
  const openWaitMs = s.openWait
    ? Math.max(0, now - parseMs(s.openWait.startedAt, now))
    : 0;
  const waitingMs = sumWaits(s.waits) + openWaitMs;
  return {
    elapsedMs,
    waitingMs,
    workingMs: Math.max(0, elapsedMs - waitingMs),
    openWaitMs,
  };
}

// ── reconciliation ──────────────────────────────────────────────────────────

/**
 * The in-flight ops with an identity — the orphan reconciler's candidate set.
 * A headless op (no `requested` seen) is never a candidate: finalizing it from a
 * partial view would stamp an invented terminal.
 */
export function orphanedOps(
  states: Iterable<OpFoldState>,
): (OpFoldState & { identity: OpIdentity })[] {
  const out: (OpFoldState & { identity: OpIdentity })[] = [];
  for (const s of states) {
    if (isTerminalState(s)) continue;
    const { identity } = s;
    if (identity) out.push({ ...s, identity });
  }
  return out;
}

/**
 * The terminal a reconciler appends for an op that died without writing one:
 * interrupted, `outcome: "error"`, no duration (it has no real end), the closed
 * waits kept and an open wait dropped rather than clocked to an invented end.
 * `seq` continues the op's own sequence.
 */
export function reconcilerCompletedEvent(
  s: OpFoldState & { identity: OpIdentity },
  now: number,
): OpEvent {
  const requestedAt = s.requestedAt ?? new Date(now).toISOString();
  // A dead op parked in a wait is the case history most needs to show (what it
  // was stuck on, why, which requeue cycle), so the open wait is kept, closed
  // as `aborted`. Its true end is unknown: it is clocked to when the
  // reconciler noticed, an upper bound (one reconcile tick late, or longer
  // while main was down).
  const nowT = Math.max(0, now - parseMs(s.requestedAt, now));
  const waits: OpWait[] =
    s.openWait === null ? s.waits : [...s.waits, abortedAt(s.openWait, nowT)];
  const summary: OpSummary = {
    ...s.identity,
    requestedAt,
    grantedAt: s.grantedAt,
    completedAt: null,
    waits,
    holdMs: 0,
    totalMs: 0,
    outcome: "error",
    interrupted: true,
    steps: [],
  };
  return {
    v: 2,
    opId: s.opId,
    seq: s.lastSeq + 1,
    at: new Date(now).toISOString(),
    t: Math.max(0, now - parseMs(s.requestedAt, now)),
    e: "completed",
    by: "reconciler",
    summary,
  };
}

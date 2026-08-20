import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import type { PendingTurnRecord, PendingTurnState } from "./store";

// The PURE half of the pending-turn state machine — the complete record→record
// transition, in two passes: `matchPendingTurns` (transcript identity match)
// then `sweepPendingTurns` (reload recovery, confirmation deadline, TTL). No
// storage, no timers, no reporting, no clock: the store composes them and owns
// every side effect. Both are bun:test-covered in reconcile.test.ts, including
// the property that makes the pipeline safe to drive from a render effect:
//
//   IDEMPOTENCE — sweep(match(x)) is a fixed point. Running it twice reports
//   `changed: false` the second time, for every state.
//
// That property is load-bearing, not cosmetic. The store commits (and notifies
// its React subscribers) exactly when a pass reports `changed`, and the pane
// re-runs the pass on every notify — so a transition pair that could ping-pong
// is an unbounded synchronous update loop (React "Maximum update depth"). Two
// rules keep the pipeline convergent, and both are enforced here rather than
// left to each call site:
//
//   1. `changed` is DERIVED from record identity, never hand-set. A pass cannot
//      claim a change it did not make, so a commit is never a no-op.
//   2. `toUnconfirmed` is the single never-revert chokepoint: a record the
//      transcript has already resolved can never be taken back by a deadline,
//      a reload, or the TTL sweep.
//   3. Eligibility is STATELESS. The matcher writes nothing to a record except
//      a state transition — which rows a record may bind is derived from its
//      own `createdAt`, not remembered from an earlier pass — so
//      `match(records, events)` cannot depend on how many passes preceded it.
//      It used to: a per-record baseline stamped on the record's first pass
//      made the same (record, transcript) pair answer differently depending on
//      when the pane happened to run, and a first pass deferred past the turn's
//      own arrival declared a delivered turn unconfirmed.

export const CONFIRM_DEADLINE_MS = 90_000;
export const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches persistent-draft's default

/**
 * Sub-second allowance around the send watermark, for the two clocks involved:
 * the browser stamping `createdAt` and the CLI writing the transcript line.
 * It is a *skew allowance*, not a matching window — a turn's own row is always
 * written after its record exists, so the only thing this absorbs is jitter
 * around that instant.
 *
 * The size is decided by the asymmetry of the two failure directions. Too
 * SMALL and a turn's own row falls outside the window: a false `unconfirmed`, a
 * Retry taken on false information, and the same text delivered to the agent
 * twice — the observed incident. Too LARGE and a *prior* identical row inside
 * the window resolves the record: a silent false "delivered", which is worse,
 * but which needs an identical text sent within the window. Short repeat-prone
 * sends ("Go", "continue") are common, so the window must stay far below any
 * plausible human re-send interval. 1 s satisfies both.
 */
export const CLOCK_SKEW_ALLOWANCE_MS = 1_000;

export const UNCONFIRMED_MESSAGE =
  "Not confirmed — the agent may not have received this message. Check the terminal.";
export const INTERRUPTED_MESSAGE = "Send interrupted — status unknown";

/**
 * Transcript-resolved: the session log itself accounts for this record, either
 * as a delivered turn (`sent`) or as a prompt parked in the CLI's queue
 * (`queued`). The transcript is ground truth, so these states are terminal with
 * respect to every failure path.
 */
export function isTranscriptResolved(state: PendingTurnState): boolean {
  return state === "queued" || state === "sent";
}

/** Already settled as a failure — the TTL sweep re-reports only non-terminals. */
export function isTerminal(rec: PendingTurnRecord): boolean {
  return (
    rec.state === "failed-post" ||
    (rec.state === "unconfirmed" && rec.reported === true)
  );
}

/**
 * The ONE transition into `unconfirmed`. Every path that would otherwise strand
 * a record — the confirmation deadline, an owner-tab reload, the TTL sweep, the
 * FIFO overflow — routes through here, so never-revert holds by construction:
 * a transcript-resolved record is returned untouched.
 *
 * Without this chokepoint the deadline could demote a `queued` record that the
 * matcher had just promoted out of `unconfirmed`, and the two rules would cycle
 * forever (each iteration a commit → notify → re-reconcile).
 *
 * `report` is true only on the first entry per episode; the caller files it.
 */
export function toUnconfirmed(
  rec: PendingTurnRecord,
  message: string,
): { record: PendingTurnRecord; report: boolean } {
  if (isTranscriptResolved(rec.state)) return { record: rec, report: false };
  return {
    record: {
      ...rec,
      state: "unconfirmed",
      errorMessage: message,
      failureKind: undefined,
      // The deadline is spent. `deadlineAt != null` means "awaiting first
      // transcript confirmation" — leaving an elapsed one behind is what let a
      // re-matched record trip it a second time.
      deadlineAt: undefined,
      reported: true,
    },
    report: !rec.reported,
  };
}

/**
 * Normalize text for identity matching against the transcript. The transcript
 * side has image `@<path>` tokens stripped by the server's pushTextWithImages
 * (parse-jsonl.ts) — the regex below mirrors its token grammar — and both
 * sides may differ in insignificant whitespace, so we strip tokens, collapse
 * whitespace runs, and trim.
 */
export function normalizeForMatch(s: string): string {
  // Local regex instance: the g flag stores match state in lastIndex, so a
  // shared module-level regex would be a footgun if this ever runs re-entrantly.
  const imageTokenRe = /@(\/[^\s@]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/gi;
  return s.replace(imageTokenRe, " ").replace(/\s+/g, " ").trim();
}

export interface MatchOutcome {
  /** New array; records untouched by this pass keep their object identity. */
  records: PendingTurnRecord[];
  changed: boolean;
}

/** Derives `changed` from identity so a pass can never claim a phantom change. */
function outcome(
  before: PendingTurnRecord[],
  after: PendingTurnRecord[],
): { records: PendingTurnRecord[]; changed: boolean } {
  const changed =
    before.length !== after.length || after.some((r, i) => r !== before[i]);
  return { records: changed ? after : before, changed };
}

/** A transcript row a record could bind to: when it was written, and what it says. */
interface Candidate {
  atMs: number;
  normalized: string;
}

/**
 * The SINGLE definition of eligibility: a record binds only to rows the session
 * log wrote at or after the instant its own send was dispatched. `createdAt` is
 * that instant (see its doc in store.ts) and is never moved, so this is a
 * property of the record — not of when the matcher first ran.
 */
function matchWindowStart(rec: PendingTurnRecord): number {
  return rec.createdAt - CLOCK_SKEW_ALLOWANCE_MS;
}

/**
 * One reconcile pass of pending records against the transcript events.
 *
 * - Matches every unresolved record against `user-text` events written at or
 *   after its own send (→ `sent`), falling back to `queue-operation` enqueue
 *   events whose content matches (→ `queued`). The user-text match takes
 *   precedence. Both arms are gated the same way, so a row that predates the
 *   send — an identical message the user sent earlier — can resolve neither.
 *   "Unresolved" includes the FAILED states (`failed-post` / `unconfirmed`):
 *   the transcript is ground truth in BOTH directions, so a turn the CLI took
 *   before the POST reported a failure is a delivered turn, and its failure
 *   card retires here rather than stranding beside the delivered message.
 * - A per-pass consumed-index set (records oldest-first, events earliest-first)
 *   guarantees two identical in-flight messages bind to DISTINCT events.
 *   Already-matched records (`sent` during its flash window, `queued`) re-consume
 *   their event each pass so a sibling can never rebind it.
 *
 * Records are stored oldest-first and `createdAt` is non-decreasing along the
 * array, so the eligibility windows are nested in exactly the order the matcher
 * walks them. Greedy earliest-first assignment over nested windows is a maximum
 * matching: no younger record can strand an older one.
 *
 * The pass writes nothing but state transitions, so it is a pure function of
 * `(records, events, now)` — running it against the same transcript from a
 * different pass count gives the same answer.
 */
export function matchPendingTurns(
  records: PendingTurnRecord[],
  events: JsonlEvent[],
  now: number = Date.now(),
): MatchOutcome {
  const userTexts: Candidate[] = [];
  const enqueues: Candidate[] = [];
  for (const event of events) {
    if (event.kind === "user-text") {
      userTexts.push({
        atMs: Date.parse(event.at),
        normalized: normalizeForMatch(event.text),
      });
    } else if (
      event.kind === "queue-operation" &&
      event.operation === "enqueue" &&
      event.content
    ) {
      enqueues.push({
        atMs: Date.parse(event.at),
        normalized: normalizeForMatch(event.content),
      });
    }
  }

  const consumedUser = new Set<number>();
  const consumedEnqueue = new Set<number>();

  // The array index IS the row's ordinal and IS the consumed-set key — nothing
  // to keep in sync, and the earliest eligible row is taken first.
  const take = (
    candidates: Candidate[],
    consumed: Set<number>,
    target: string,
    since: number,
  ): boolean => {
    const idx = candidates.findIndex(
      (c, i) => c.atMs >= since && !consumed.has(i) && c.normalized === target,
    );
    if (idx === -1) return false;
    consumed.add(idx);
    return true;
  };
  const takeUserText = (target: string, since: number): boolean =>
    take(userTexts, consumedUser, target, since);
  const takeEnqueue = (target: string, since: number): boolean =>
    take(enqueues, consumedEnqueue, target, since);

  const next = records.map((rec) => {
    const target = normalizeForMatch(rec.resolvedText ?? rec.text);
    const since = matchWindowStart(rec);

    if (rec.state === "sent") {
      // Re-consume its event during the flash window so an identical in-flight
      // sibling cannot bind the same row.
      takeUserText(target, since);
      return rec;
    }
    if (rec.state === "queued") {
      if (takeUserText(target, since)) {
        return { ...rec, state: "sent" as const, matchedAt: now };
      }
      // Still parked: re-consume its enqueue row for the same reason as above.
      takeEnqueue(target, since);
      return rec;
    }
    // Everything else — in-flight (`sending` / `posted`) and failed
    // (`failed-post` / `unconfirmed`) alike. A failed record is matchable for
    // the same reason a matched record outranks a late POST error in the store:
    // the POST outcome is not the truth channel. A send whose side effect
    // landed and whose *verification* then failed (tmux submit-verify timing
    // out under load, a 500 raised after the paste, a torn connection) shows up
    // in the transcript regardless — and when it does, it was delivered.
    if (takeUserText(target, since)) {
      return { ...rec, state: "sent" as const, matchedAt: now };
    }
    if (takeEnqueue(target, since)) {
      // Parked in the CLI's prompt queue: the native queue-op row takes over
      // the display. Failure metadata is dropped with the failed state, and so
      // is the confirmation deadline — the transcript has confirmed this
      // record, so there is nothing left for the deadline to catch.
      return {
        ...rec,
        state: "queued" as const,
        failureKind: undefined,
        errorMessage: undefined,
        deadlineAt: undefined,
      };
    }
    return rec;
  });

  return outcome(records, next);
}

export interface SweepContext {
  now: number;
  /** This tab's id — only the owner tab adopts its own interrupted sends. */
  tabId: string;
  /** Record ids whose POST promise is live in THIS tab. */
  liveInflight: ReadonlySet<string>;
}

export interface SweepOutcome extends MatchOutcome {
  /** Records that newly entered `unconfirmed` — the store files one each. */
  reports: PendingTurnRecord[];
}

/**
 * The post-match pass: drop reconciled records, adopt sends orphaned by a
 * reload, trip the absolute confirmation deadline, and sweep the TTL. Runs on
 * the matcher's output so a record that matched this very pass lands `sent`
 * before any retirement can consider it.
 *
 * Only `posted` records carry a live deadline. `queued` is transcript-confirmed
 * and therefore has none (see `toUnconfirmed`) — a prompt parked in the CLI's
 * own queue is displayed by the native queue-op row, and it resolves when the
 * CLI dequeues it into a `user-text` row.
 */
export function sweepPendingTurns(
  records: PendingTurnRecord[],
  { now, tabId, liveInflight }: SweepContext,
): SweepOutcome {
  const kept: PendingTurnRecord[] = [];
  const reports: PendingTurnRecord[] = [];

  const retire = (
    rec: PendingTurnRecord,
    message: string,
  ): PendingTurnRecord => {
    const { record, report } = toUnconfirmed(rec, message);
    if (report) reports.push(rec);
    return record;
  };

  for (const original of records) {
    let rec = original;
    if (rec.state === "sent") {
      // Reconciled: the real user-text row IS the feedback — no extra
      // indicator, the record is simply dropped.
      continue;
    }
    if (
      rec.state === "sending" &&
      rec.ownerTabId === tabId &&
      !liveInflight.has(rec.id)
    ) {
      // Owner-tab reload found the record mid-send with no live POST: the
      // outcome is unknown and auto-resend is forbidden — surface it.
      rec = retire(rec, INTERRUPTED_MESSAGE);
    } else if (
      rec.state === "posted" &&
      rec.deadlineAt != null &&
      now >= rec.deadlineAt
    ) {
      // Absolute deadline: any tab adopts an orphaned record here.
      rec = retire(rec, UNCONFIRMED_MESSAGE);
    }
    if (now - rec.createdAt > RECORD_TTL_MS) {
      // Swept — but never silently: a non-terminal casualty reports first.
      if (!isTerminal(rec)) retire(rec, UNCONFIRMED_MESSAGE);
      continue;
    }
    kept.push(rec);
  }

  return { ...outcome(records, kept), reports };
}

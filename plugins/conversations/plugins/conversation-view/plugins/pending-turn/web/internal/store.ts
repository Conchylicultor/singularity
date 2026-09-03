import { useCallback, useSyncExternalStore } from "react";
import {
  EndpointError,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { getTabId } from "@plugins/primitives/plugins/scope/plugins/tab-id/web";
import { report } from "@plugins/reports/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  CONFIRM_DEADLINE_MS,
  isTerminal,
  isTranscriptResolved,
  matchPendingTurns,
  sweepPendingTurns,
  toUnconfirmed,
  UNCONFIRMED_MESSAGE,
} from "./reconcile";
import {
  clearPendingTurns,
  pendingTurnsKey,
  readPendingTurns,
  subscribePendingTurns,
  writePendingTurns,
} from "./persist";
import {
  getTurnDelivery,
  POST_TURN_DELIVERY_ID,
  UnknownTurnDeliveryError,
  type TurnDelivery,
} from "./delivery";

// ---------------------------------------------------------------------------
// Durable pending-turn store — the owner of the ENTIRE send lifecycle, and the
// SINGLE ENTRY POINT for sending a turn from the browser. On send a record is
// created synchronously (pre-request) so the echo is instant; the delivery, the
// confirmation deadline, transcript reconciliation, and failure reporting all
// run here. Records persist in localStorage (per conversation), so a refresh or
// server restart never loses an in-flight send: every send resolves explicitly
// to sent / failed-post / unconfirmed — no silent path exists.
//
// "Single entry point" is the load-bearing part. Every surface that puts text
// in front of the agent — the prompt input, the template chips, the Send/Queue/
// Go button, Push & Close's wrap-up prompt, an AskUserQuestion answer — routes
// through `sendConversationTurn`, differing ONLY in its `TurnDelivery` (see
// delivery.ts). A surface that calls its endpoint directly gets none of the
// guarantees below, silently; `turn-send-safety/no-adhoc-turn-send` makes that
// a lint error rather than a thing to remember.
//
// Never-revert (vocabulary borrowed from primitives/optimistic-mutation): the
// transcript is ground truth; once a record matched (`sent`/`queued`) a late
// delivery outcome can only enrich it, never regress it. This holds SYMMETRICALLY —
// a delivery failure that lands first is not final either: the matcher keeps
// `failed-post`/`unconfirmed` records in play, so a turn the agent actually
// received retires its own failure card (see reconcile.ts). Only the transcript
// resolves a record; no delivery outcome, in either direction, is the last word.
// Failures are manual-retry only — the tmux paste race can strand text in the
// CLI input box, so re-send must be a deliberate user action.
//
// Multi-tab: all tabs render the shared records; only `ownerTabId === getTabId()`
// drives the delivery promise and the deadline timer. `deadlineAt` is absolute, so
// any tab's reconcile pass can adopt an orphaned record whose owner tab closed.
//
// This module owns the SIDE EFFECTS only — storage, timers, the delivery, the
// report. The record→record transition itself lives in reconcile.ts as two pure
// passes (match, then sweep), where it is bun:test-covered for the idempotence
// the render-effect driver depends on. See that file's header.
// ---------------------------------------------------------------------------

export type PendingTurnState =
  | "sending"
  | "posted"
  | "queued"
  // Transient: assigned by the matcher, dropped at reconcile in the same pass —
  // never committed/persisted. The real user-text row is the only feedback.
  | "sent"
  | "failed-post"
  | "unconfirmed";

export interface PendingTurnRecord {
  id: string;
  /** Tab that drives the delivery promise, the deadline timer, and the report. */
  ownerTabId: string;
  /**
   * The echoed text — what the pending card shows, what Copy-to-draft restores,
   * and the transcript-match target until a delivery reports a `resolvedText`.
   */
  text: string;
  /** The server's finalText (attachment refs rewritten) — what matching uses. */
  resolvedText: string | null;
  /**
   * Which registered {@link TurnDelivery} carried this turn, and the payload it
   * was handed. Both serializable so Retry re-dispatches correctly after a
   * reload. Absent on records written before deliveries existed — read them
   * through {@link deliveryFor}, never directly.
   */
  deliveryId?: string;
  payload?: unknown;
  /**
   * Whether the in-flight echo card renders (default true). `false` is for
   * surfaces that already show their own in-flight state inline — the
   * AskUserQuestion answer form, whose delivered turn the transcript hides
   * anyway. Failure cards render regardless: a send that needs Retry must be
   * reachable no matter which surface started it.
   */
  echo?: boolean;
  state: PendingTurnState;
  failureKind?: "http" | "network" | "delivery";
  errorMessage?: string;
  /**
   * When the send was dispatched, and the record's whole notion of time. It has
   * TWO jobs: it is the TTL origin, and it is the transcript watermark — only
   * rows the session log wrote at or after this instant (within a sub-second
   * skew allowance) can bind to this record, so a pre-existing identical
   * message never resolves it. It is set once, in `sendConversationTurn`,
   * before the delivery is dispatched, and is NEVER moved afterwards —
   * including across Retry, where keeping it is what lets the original send's
   * own row retire the record if it landed and we merely failed to see it.
   */
  createdAt: number;
  postedAt?: number;
  deadlineAt?: number;
  matchedAt?: number;
  /** Unconfirmed report latched once per episode. */
  reported?: boolean;
}

const DELIVERY_TIMEOUT_MS = 30_000;
const MAX_RECORDS_PER_CONV = 10;

interface ConvEntry {
  records: PendingTurnRecord[];
  listeners: Set<() => void>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

const EMPTY: PendingTurnRecord[] = [];
const entries = new Map<string, ConvEntry>();
/** Record ids whose delivery promise is live in THIS tab (distinguishes an
 * in-flight send from a `sending` record found after a reload). */
const inflightPosts = new Set<string>();

function getEntry(conversationId: string): ConvEntry {
  let entry = entries.get(conversationId);
  if (entry) return entry;
  const sKey = pendingTurnsKey(conversationId);
  // `sent` is transient (dropped at reconcile, never re-committed) — filter any
  // legacy persisted flash records from before that rule.
  const stored = readPendingTurns<PendingTurnRecord[]>(sKey, EMPTY).filter(
    (r) => r.state !== "sent",
  );
  entry = {
    records: stored.length ? stored : EMPTY,
    listeners: new Set(),
    timers: new Map(),
  };
  entries.set(conversationId, entry);
  // Attached for the tab's lifetime (bounded by conversations viewed). Our own
  // write's echo is filtered by the serialized comparison in refreshFromStorage.
  subscribePendingTurns(sKey, () => refreshFromStorage(conversationId));
  applyTimers(conversationId, entry);
  return entry;
}

function notify(entry: ConvEntry): void {
  for (const listener of entry.listeners) listener();
}

function refreshFromStorage(conversationId: string): void {
  const entry = entries.get(conversationId);
  if (!entry) return;
  const stored = readPendingTurns<PendingTurnRecord[]>(
    pendingTurnsKey(conversationId),
    EMPTY,
  ).filter((r) => r.state !== "sent");
  if (JSON.stringify(stored) === JSON.stringify(entry.records)) return;
  entry.records = stored.length ? stored : EMPTY;
  applyTimers(conversationId, entry);
  notify(entry);
}

function commit(
  conversationId: string,
  entry: ConvEntry,
  records: PendingTurnRecord[],
): void {
  entry.records = records.length ? records : EMPTY;
  const sKey = pendingTurnsKey(conversationId);
  if (records.length) writePendingTurns(sKey, records);
  else clearPendingTurns(sKey);
  applyTimers(conversationId, entry);
  notify(entry);
}

function updateRecord(
  conversationId: string,
  recordId: string,
  patch: (r: PendingTurnRecord) => PendingTurnRecord,
): void {
  const entry = getEntry(conversationId);
  const idx = entry.records.findIndex((r) => r.id === recordId);
  if (idx === -1) return;
  const next = entry.records.slice();
  next[idx] = patch(next[idx]!);
  commit(conversationId, entry, next);
}

/** The one deduped `turn-unconfirmed` report; latched by `reported` upstream. */
function fileUnconfirmedReport(
  conversationId: string,
  rec: PendingTurnRecord,
): void {
  void report({
    kind: "turn-unconfirmed",
    source: "client-turn-unconfirmed",
    data: {
      conversationId,
      textPreview: (rec.resolvedText ?? rec.text).slice(0, 120),
      elapsedMs: Date.now() - rec.createdAt,
    },
    message: "Turn not confirmed in transcript",
    url: window.location.href,
  });
}

// --- timers ----------------------------------------------------------------
// One-shot setTimeouts only (no polling): the absolute confirmation deadline
// (owner tab only). Callbacks re-validate against the current records, so a
// deadline moved by another tab re-arms instead of tripping early.

function timerDelayFor(rec: PendingTurnRecord, now: number): number | null {
  // `posted` only: a transcript-resolved record carries no deadline at all.
  if (
    rec.state === "posted" &&
    rec.deadlineAt != null &&
    rec.ownerTabId === getTabId()
  ) {
    return Math.max(0, rec.deadlineAt - now);
  }
  return null;
}

function applyTimers(conversationId: string, entry: ConvEntry): void {
  const now = Date.now();
  const live = new Set(entry.records.map((r) => r.id));
  for (const [id, timer] of entry.timers) {
    if (!live.has(id)) {
      clearTimeout(timer);
      entry.timers.delete(id);
    }
  }
  for (const rec of entry.records) {
    const delay = timerDelayFor(rec, now);
    const existing = entry.timers.get(rec.id);
    if (delay == null) {
      if (existing != null) {
        clearTimeout(existing);
        entry.timers.delete(rec.id);
      }
      continue;
    }
    if (existing != null) continue;
    const timer = setTimeout(() => {
      entry.timers.delete(rec.id);
      onTimer(conversationId, rec.id);
    }, delay);
    entry.timers.set(rec.id, timer);
  }
}

function onTimer(conversationId: string, recordId: string): void {
  const entry = getEntry(conversationId);
  const rec = entry.records.find((r) => r.id === recordId);
  if (!rec) return;
  const now = Date.now();
  if (rec.state !== "posted") return;
  if (rec.deadlineAt == null) return;
  if (now < rec.deadlineAt) {
    // Deadline moved (e.g. extended by another tab) — re-arm the remainder.
    applyTimers(conversationId, entry);
    return;
  }
  const { record, report: shouldReport } = toUnconfirmed(
    rec,
    UNCONFIRMED_MESSAGE,
  );
  if (record === rec) return;
  if (shouldReport) fileUnconfirmedReport(conversationId, rec);
  updateRecord(conversationId, recordId, () => record);
}

// --- delivery leg ----------------------------------------------------------

/**
 * Resolve a record's delivery + payload. The ONE place the legacy shape is
 * understood: a record written before deliveries existed carries neither field
 * and is, by definition, a plain `postConversationTurn` send of its own text.
 */
function deliveryFor(rec: PendingTurnRecord): {
  delivery: TurnDelivery<unknown>;
  payload: unknown;
} {
  return {
    delivery: getTurnDelivery(rec.deliveryId ?? POST_TURN_DELIVERY_ID),
    payload: rec.deliveryId == null ? { text: rec.text } : rec.payload,
  };
}

async function runDelivery(
  conversationId: string,
  rec: PendingTurnRecord,
): Promise<void> {
  const recordId = rec.id;
  try {
    // Inside the try on purpose: an unregistered delivery (its owning plugin
    // never loaded) is a failed send like any other — it lands on the card with
    // Retry + Copy-to-draft rather than escaping as an unhandled rejection.
    const { delivery, payload } = deliveryFor(rec);
    const res = await delivery.send(
      conversationId,
      payload,
      AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    );
    const now = Date.now();
    updateRecord(conversationId, recordId, (r) => {
      // Never revert: the transcript may already have matched this record
      // (sent/queued) before the delivery response landed — only enrich it.
      const enriched = {
        ...r,
        // A delivery whose endpoint rewrites nothing reports `null`; the
        // record then keeps matching on its own echoed `text`.
        resolvedText: res.resolvedText,
        postedAt: now,
        // A record the transcript already resolved has nothing left to confirm,
        // so the delivery response must not arm a deadline behind it.
        deadlineAt: isTranscriptResolved(r.state)
          ? undefined
          : (r.deadlineAt ?? now + CONFIRM_DEADLINE_MS),
      };
      return r.state === "sending"
        ? { ...enriched, state: "posted" as const }
        : enriched;
    });
  } catch (err) {
    const failureKind =
      err instanceof UnknownTurnDeliveryError
        ? "delivery"
        : err instanceof EndpointError
          ? "http"
          : "network";
    updateRecord(conversationId, recordId, (r) =>
      // A record already confirmed by the transcript outranks a late failure.
      r.state === "sending"
        ? {
            ...r,
            state: "failed-post",
            failureKind,
            errorMessage:
              failureKind === "delivery"
                ? (err as Error).message
                : getEndpointErrorMessage(err),
          }
        : r,
    );
  } finally {
    inflightPosts.delete(recordId);
  }
}

// --- public API ------------------------------------------------------------

/**
 * How a surface describes the turn it wants sent. Either shape works; the
 * second exists so a surface whose turn does NOT travel over
 * `postConversationTurn` still gets the identical lifecycle. `delivery` and
 * `payload` are tied together by `P`, so a delivery can never be paired with a
 * payload it does not understand.
 */
export type TurnSend<P> =
  | { text: string; echo?: boolean }
  | { text: string; echo?: boolean; delivery: TurnDelivery<P>; payload: P };

/**
 * THE entry point for sending a turn from the browser. Creates the record
 * synchronously (instant echo) and starts the delivery. Returns immediately —
 * the record, not the promise, is the caller's feedback channel, so no surface
 * needs its own in-flight state, error toast, or retry affordance.
 */
export function sendConversationTurn<P>(
  conversationId: string,
  turn: TurnSend<P>,
): string {
  const entry = getEntry(conversationId);
  const hasDelivery = "delivery" in turn;
  const record: PendingTurnRecord = {
    id: crypto.randomUUID(),
    ownerTabId: getTabId(),
    text: turn.text,
    resolvedText: null,
    deliveryId: hasDelivery ? turn.delivery.id : POST_TURN_DELIVERY_ID,
    payload: hasDelivery ? turn.payload : { text: turn.text },
    echo: turn.echo ?? true,
    state: "sending",
    // The transcript watermark (see the field's doc): read synchronously here,
    // BEFORE the delivery below is dispatched, so the record can never be
    // younger than the row its own turn produces. Moving this line after the
    // delivery would look harmless and would make a turn unmatchable.
    createdAt: Date.now(),
  };
  const next = [...entry.records, record];
  // FIFO cap: retire the oldest overflow records. A non-terminal casualty
  // still routes through unconfirmed (one report) — no send vanishes silently.
  while (next.length > MAX_RECORDS_PER_CONV) {
    const oldest = next.shift()!;
    if (isTerminal(oldest)) continue;
    const { report: shouldReport } = toUnconfirmed(oldest, UNCONFIRMED_MESSAGE);
    if (shouldReport) fileUnconfirmedReport(conversationId, oldest);
  }
  commit(conversationId, entry, next);
  inflightPosts.add(record.id);
  void runDelivery(conversationId, record);
  return record.id;
}

/**
 * Manual re-send of a failed/unconfirmed record, through the SAME delivery it
 * was created with — which is why the record persists `{ deliveryId, payload }`
 * rather than a closure: this runs just as often after a reload, in a tab that
 * never saw the original send.
 */
export function retryPendingTurn(
  conversationId: string,
  recordId: string,
): void {
  const entry = getEntry(conversationId);
  const rec = entry.records.find((r) => r.id === recordId);
  if (!rec || (rec.state !== "failed-post" && rec.state !== "unconfirmed"))
    return;
  updateRecord(conversationId, recordId, (r) => ({
    ...r,
    state: "sending",
    ownerTabId: getTabId(),
    resolvedText: null,
    failureKind: undefined,
    errorMessage: undefined,
    // `createdAt` is deliberately NOT re-stamped: the retry keeps the original
    // send's watermark. If that send did land and only its verification failed,
    // its own row is the truth the card owes the user and must stay matchable;
    // if it never landed, no such row exists and the retry's own row matches
    // anyway. Moving the watermark forward could only hide a delivered turn.
    postedAt: undefined,
    deadlineAt: undefined,
    matchedAt: undefined,
    // A new unconfirmed episode after retry reports again (server dedupes).
    reported: false,
  }));
  inflightPosts.add(recordId);
  void runDelivery(conversationId, rec);
}

export function dismissPendingTurn(
  conversationId: string,
  recordId: string,
): void {
  const entry = getEntry(conversationId);
  if (!entry.records.some((r) => r.id === recordId)) return;
  commit(
    conversationId,
    entry,
    entry.records.filter((r) => r.id !== recordId),
  );
}

/**
 * The reconcile pass — called by the transcript pane on every events change.
 * Pure transition (match, then sweep) plus this module's side effects. Order
 * matters: transcript match first, so a record that matched THIS pass lands
 * `sent` before the sweep can consider retiring it.
 *
 * Convergence is the pure half's contract, not a caller obligation: a pass that
 * reports `changed` really did change the records, so the commit → notify →
 * re-reconcile cycle the pane drives always terminates.
 */
export function reconcilePendingTurns(
  conversationId: string,
  events: JsonlEvent[],
): void {
  const entry = getEntry(conversationId);
  if (entry.records.length === 0) return;
  const now = Date.now();
  const matched = matchPendingTurns(entry.records, events, now);
  const swept = sweepPendingTurns(matched.records, {
    now,
    tabId: getTabId(),
    liveInflight: inflightPosts,
  });
  for (const rec of swept.reports) fileUnconfirmedReport(conversationId, rec);
  if (matched.changed || swept.changed)
    commit(conversationId, entry, swept.records);
  // Ensure timers are armed even when nothing changed (reload within deadline).
  else applyTimers(conversationId, entry);
}

const getServerSnapshot = (): PendingTurnRecord[] => EMPTY;

export function usePendingTurns(conversationId: string): PendingTurnRecord[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const entry = getEntry(conversationId);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [conversationId],
  );
  // Stable reference per state: `records` is replaced only on commit/refresh.
  const getSnapshot = useCallback(
    () => getEntry(conversationId).records,
    [conversationId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

import { useCallback, useSyncExternalStore } from "react";
import {
  EndpointError,
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { postConversationTurn } from "@plugins/conversations/core";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { report } from "@plugins/reports/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { matchPendingTurns } from "./reconcile";
import {
  clearPendingTurns,
  pendingTurnsKey,
  readPendingTurns,
  subscribePendingTurns,
  writePendingTurns,
} from "./persist";

// ---------------------------------------------------------------------------
// Durable pending-turn store — the owner of the ENTIRE send lifecycle. On Enter
// a record is created synchronously (pre-POST) so the echo is instant; the POST,
// the confirmation deadline, transcript reconciliation, and failure reporting
// all run here. Records persist in localStorage (per conversation), so a
// refresh or server restart never loses an in-flight send: every send resolves
// explicitly to sent / failed-post / unconfirmed — no silent path exists.
//
// Never-revert (vocabulary borrowed from primitives/optimistic-mutation): the
// transcript is ground truth; once a record matched (`sent`/`queued`) a late
// POST outcome can only enrich it, never regress it. Failures are manual-retry
// only — the tmux paste race can strand text in the CLI input box, so re-send
// must be a deliberate user action.
//
// Multi-tab: all tabs render the shared records; only `ownerTabId === getTabId()`
// drives the POST promise and the deadline timer. `deadlineAt` is absolute, so
// any tab's reconcile pass can adopt an orphaned record whose owner tab closed.
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
  /** Tab that drives the POST promise, the deadline timer, and the report. */
  ownerTabId: string;
  /** Original draft text — what Retry re-POSTs and Copy-to-draft restores. */
  text: string;
  /** The server's finalText (attachment refs rewritten) — what matching uses. */
  resolvedText: string | null;
  state: PendingTurnState;
  failureKind?: "http" | "network";
  errorMessage?: string;
  /** Count of user-text events at first reconcile — earlier rows never match. */
  baselineUserText: number | null;
  createdAt: number;
  postedAt?: number;
  deadlineAt?: number;
  matchedAt?: number;
  /** Unconfirmed report latched once per episode. */
  reported?: boolean;
}

const POST_TIMEOUT_MS = 30_000;
const CONFIRM_DEADLINE_MS = 90_000;
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches persistent-draft's default
const MAX_RECORDS_PER_CONV = 10;

const UNCONFIRMED_MESSAGE =
  "Not confirmed — the agent may not have received this message. Check the terminal.";
const INTERRUPTED_MESSAGE = "Send interrupted — status unknown";

interface ConvEntry {
  records: PendingTurnRecord[];
  listeners: Set<() => void>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  /** Last isWorking seen by reconcile — read by the deadline timer callback. */
  lastWorking: boolean;
}

const EMPTY: PendingTurnRecord[] = [];
const entries = new Map<string, ConvEntry>();
/** Record ids whose POST promise is live in THIS tab (distinguishes an
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
    lastWorking: false,
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

function isTerminal(rec: PendingTurnRecord): boolean {
  return (
    rec.state === "failed-post" ||
    (rec.state === "unconfirmed" && rec.reported === true)
  );
}

/** Transition to `unconfirmed`, filing the one deduped report (latched). */
function toUnconfirmed(
  conversationId: string,
  rec: PendingTurnRecord,
  message: string,
): PendingTurnRecord {
  if (!rec.reported) {
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
  return {
    ...rec,
    state: "unconfirmed",
    errorMessage: message,
    failureKind: undefined,
    reported: true,
  };
}

// --- timers ----------------------------------------------------------------
// One-shot setTimeouts only (no polling): the absolute confirmation deadline
// (owner tab only). Callbacks re-validate against the current records, so a
// deadline moved by another tab re-arms instead of tripping early.

function timerDelayFor(rec: PendingTurnRecord, now: number): number | null {
  if (
    (rec.state === "posted" || rec.state === "queued") &&
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
  if (rec.state !== "posted" && rec.state !== "queued") return;
  if (rec.deadlineAt == null) return;
  if (now < rec.deadlineAt) {
    // Deadline moved (e.g. extended by another tab) — re-arm the remainder.
    applyTimers(conversationId, entry);
    return;
  }
  if (rec.state === "queued" && entry.lastWorking) {
    // The agent is mid-turn: a queued prompt is EXPECTED to sit undelivered
    // until the turn ends, so tripping unconfirmed would misfire on every long
    // turn. Push the deadline out; delivery (user-text) or an idle reconcile
    // resolves it.
    updateRecord(conversationId, recordId, (r) => ({
      ...r,
      deadlineAt: now + CONFIRM_DEADLINE_MS,
    }));
    return;
  }
  updateRecord(conversationId, recordId, (r) =>
    toUnconfirmed(conversationId, r, UNCONFIRMED_MESSAGE),
  );
}

// --- POST leg --------------------------------------------------------------

async function runPost(
  conversationId: string,
  recordId: string,
  text: string,
): Promise<void> {
  try {
    const res = await fetchEndpoint(
      postConversationTurn,
      { id: conversationId },
      { body: { text }, signal: AbortSignal.timeout(POST_TIMEOUT_MS) },
    );
    const now = Date.now();
    updateRecord(conversationId, recordId, (r) => {
      // Never revert: the transcript may already have matched this record
      // (sent/queued) before the POST response landed — only enrich it.
      const enriched = {
        ...r,
        resolvedText: res.resolvedText,
        postedAt: now,
        deadlineAt: r.deadlineAt ?? now + CONFIRM_DEADLINE_MS,
      };
      return r.state === "sending"
        ? { ...enriched, state: "posted" as const }
        : enriched;
    });
  } catch (err) {
    const failureKind = err instanceof EndpointError ? "http" : "network";
    updateRecord(conversationId, recordId, (r) =>
      // A record already confirmed by the transcript outranks a late POST error.
      r.state === "sending"
        ? {
            ...r,
            state: "failed-post",
            failureKind,
            errorMessage: getEndpointErrorMessage(err),
          }
        : r,
    );
  } finally {
    inflightPosts.delete(recordId);
  }
}

// --- public API ------------------------------------------------------------

/** Create the record synchronously (instant echo) and start the POST. */
export function sendPendingTurn(conversationId: string, text: string): string {
  const entry = getEntry(conversationId);
  const record: PendingTurnRecord = {
    id: crypto.randomUUID(),
    ownerTabId: getTabId(),
    text,
    resolvedText: null,
    state: "sending",
    baselineUserText: null,
    createdAt: Date.now(),
  };
  const next = [...entry.records, record];
  // FIFO cap: retire the oldest overflow records. A non-terminal casualty
  // still routes through unconfirmed (one report) — no send vanishes silently.
  while (next.length > MAX_RECORDS_PER_CONV) {
    const oldest = next.shift()!;
    if (!isTerminal(oldest)) toUnconfirmed(conversationId, oldest, UNCONFIRMED_MESSAGE);
  }
  commit(conversationId, entry, next);
  inflightPosts.add(record.id);
  void runPost(conversationId, record.id, text);
  return record.id;
}

/** Manual re-POST of a failed/unconfirmed record's original text. */
export function retryPendingTurn(conversationId: string, recordId: string): void {
  const entry = getEntry(conversationId);
  const rec = entry.records.find((r) => r.id === recordId);
  if (!rec || (rec.state !== "failed-post" && rec.state !== "unconfirmed")) return;
  updateRecord(conversationId, recordId, (r) => ({
    ...r,
    state: "sending",
    ownerTabId: getTabId(),
    resolvedText: null,
    failureKind: undefined,
    errorMessage: undefined,
    // Re-stamped on next reconcile so only the retry's own delivery matches.
    baselineUserText: null,
    postedAt: undefined,
    deadlineAt: undefined,
    matchedAt: undefined,
    // A new unconfirmed episode after retry reports again (server dedupes).
    reported: false,
  }));
  inflightPosts.add(recordId);
  void runPost(conversationId, recordId, rec.text);
}

export function dismissPendingTurn(conversationId: string, recordId: string): void {
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
 * Order matters: transcript match first, then reload-recovery / absolute
 * deadline, then the TTL sweep (so a matched record lands `sent` before any
 * retirement, and a non-terminal expiry routes through unconfirmed + report).
 */
export function reconcilePendingTurns(
  conversationId: string,
  events: JsonlEvent[],
  isWorking: boolean,
): void {
  const entry = getEntry(conversationId);
  entry.lastWorking = isWorking;
  if (entry.records.length === 0) return;
  const now = Date.now();
  const matched = matchPendingTurns(entry.records, events, now);
  let changed = matched.changed;
  const tabId = getTabId();
  const kept: PendingTurnRecord[] = [];
  for (let rec of matched.records) {
    if (rec.state === "sent") {
      // Reconciled: the real user-text row IS the feedback — no extra
      // indicator, the record is simply dropped.
      changed = true;
      continue;
    }
    if (
      rec.state === "sending" &&
      rec.ownerTabId === tabId &&
      !inflightPosts.has(rec.id)
    ) {
      // Owner-tab reload found the record mid-send with no live POST: the
      // outcome is unknown and auto-resend is forbidden — surface it.
      rec = toUnconfirmed(conversationId, rec, INTERRUPTED_MESSAGE);
      changed = true;
    } else if (
      (rec.state === "posted" || rec.state === "queued") &&
      rec.deadlineAt != null &&
      now >= rec.deadlineAt
    ) {
      // Absolute deadline: any tab adopts an orphaned record here.
      if (rec.state === "queued" && isWorking) {
        rec = { ...rec, deadlineAt: now + CONFIRM_DEADLINE_MS };
      } else {
        rec = toUnconfirmed(conversationId, rec, UNCONFIRMED_MESSAGE);
      }
      changed = true;
    }
    if (now - rec.createdAt > RECORD_TTL_MS) {
      if (!isTerminal(rec)) rec = toUnconfirmed(conversationId, rec, UNCONFIRMED_MESSAGE);
      changed = true;
      continue; // swept
    }
    kept.push(rec);
  }
  if (changed) commit(conversationId, entry, kept);
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

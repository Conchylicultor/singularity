import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import type { PendingTurnRecord } from "./store";

// Pure transcript-matching half of the pending-turn state machine. No storage,
// no timers, no side effects — bun:test-covered in reconcile.test.ts.

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

/**
 * One reconcile pass of pending records against the transcript events.
 *
 * - Stamps `baselineUserText` (the count of `user-text` events) on records that
 *   have none yet — a pre-existing identical row can never match, because only
 *   events past the baseline are candidates.
 * - Matches every unresolved record against `user-text` events past its
 *   baseline (→ `sent`), falling back to `queue-operation` enqueue events whose
 *   content matches (→ `queued`). The user-text match takes precedence.
 *   "Unresolved" includes the FAILED states (`failed-post` / `unconfirmed`):
 *   the transcript is ground truth in BOTH directions, so a turn the CLI took
 *   before the POST reported a failure is a delivered turn, and its failure
 *   card retires here rather than stranding beside the delivered message.
 * - A per-pass consumed-index set (records oldest-first, events earliest-first)
 *   guarantees two identical in-flight messages bind to DISTINCT events.
 *   Already-matched records (`sent` during its flash window, `queued`) re-consume
 *   their event each pass so a sibling can never rebind it.
 */
export function matchPendingTurns(
  records: PendingTurnRecord[],
  events: JsonlEvent[],
  now: number = Date.now(),
): MatchOutcome {
  const userTexts: { ordinal: number; normalized: string }[] = [];
  const enqueues: { normalized: string }[] = [];
  for (const event of events) {
    if (event.kind === "user-text") {
      userTexts.push({
        ordinal: userTexts.length,
        normalized: normalizeForMatch(event.text),
      });
    } else if (event.kind === "queue-operation" && event.operation === "enqueue" && event.content) {
      enqueues.push({ normalized: normalizeForMatch(event.content) });
    }
  }

  const consumedUser = new Set<number>();
  const consumedEnqueue = new Set<number>();
  let changed = false;

  const takeUserText = (target: string, baseline: number): boolean => {
    const hit = userTexts.find(
      (u) => u.ordinal >= baseline && !consumedUser.has(u.ordinal) && u.normalized === target,
    );
    if (!hit) return false;
    consumedUser.add(hit.ordinal);
    return true;
  };
  const takeEnqueue = (target: string): boolean => {
    const idx = enqueues.findIndex(
      (q, i) => !consumedEnqueue.has(i) && q.normalized === target,
    );
    if (idx === -1) return false;
    consumedEnqueue.add(idx);
    return true;
  };

  const next = records.map((r) => {
    let rec = r;
    if (rec.baselineUserText == null) {
      rec = { ...rec, baselineUserText: userTexts.length };
      changed = true;
    }
    const target = normalizeForMatch(rec.resolvedText ?? rec.text);
    const baseline = rec.baselineUserText ?? 0;

    if (rec.state === "sent") {
      // Re-consume its event during the flash window so an identical in-flight
      // sibling cannot bind the same row.
      takeUserText(target, baseline);
      return rec;
    }
    if (rec.state === "queued") {
      if (takeUserText(target, baseline)) {
        changed = true;
        return { ...rec, state: "sent" as const, matchedAt: now };
      }
      // Still parked: re-consume its enqueue row for the same reason as above.
      takeEnqueue(target);
      return rec;
    }
    // Everything else — in-flight (`sending` / `posted`) and failed
    // (`failed-post` / `unconfirmed`) alike. A failed record is matchable for
    // the same reason a matched record outranks a late POST error in the store:
    // the POST outcome is not the truth channel. A send whose side effect
    // landed and whose *verification* then failed (tmux submit-verify timing
    // out under load, a 500 raised after the paste, a torn connection) shows up
    // in the transcript regardless — and when it does, it was delivered.
    if (takeUserText(target, baseline)) {
      changed = true;
      return { ...rec, state: "sent" as const, matchedAt: now };
    }
    if (takeEnqueue(target)) {
      changed = true;
      // Parked in the CLI's prompt queue: the native queue-op row takes over
      // the display. Failure metadata is dropped with the failed state.
      return {
        ...rec,
        state: "queued" as const,
        failureKind: undefined,
        errorMessage: undefined,
      };
    }
    return rec;
  });

  return { records: changed ? next : records, changed };
}

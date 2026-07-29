import { describe, expect, test } from "bun:test";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  matchPendingTurns,
  normalizeForMatch,
  sweepPendingTurns,
  type SweepContext,
} from "./reconcile";
import type { PendingTurnRecord, PendingTurnState } from "./store";

function rec(over: Partial<PendingTurnRecord> = {}): PendingTurnRecord {
  return {
    id: "r1",
    ownerTabId: "tab",
    text: "hello world",
    resolvedText: null,
    state: "posted",
    baselineUserText: 0,
    createdAt: 0,
    ...over,
  };
}

function userText(text: string): JsonlEvent {
  return { kind: "user-text", at: "2026-07-22T00:00:00Z", text };
}

function enqueue(content: string): JsonlEvent {
  return {
    kind: "queue-operation",
    at: "2026-07-22T00:00:00Z",
    operation: "enqueue",
    content,
  };
}

describe("normalizeForMatch", () => {
  test("trims and collapses whitespace runs", () => {
    expect(normalizeForMatch("  hello \n\n  world  ")).toBe("hello world");
  });

  test("strips image @<path> tokens like the server parser", () => {
    expect(normalizeForMatch("look @/tmp/shot.png done")).toBe("look done");
    expect(normalizeForMatch("@/a/b.jpeg@/c/d.png tail")).toBe("tail");
  });

  test("leaves non-image @paths untouched", () => {
    expect(normalizeForMatch("see @/etc/hosts now")).toBe("see @/etc/hosts now");
  });
});

describe("matchPendingTurns", () => {
  test("matches on resolvedText (server attachment rewrite), not the raw draft", () => {
    // Draft holds the markdown attachment ref; the server rewrote it to an
    // @<disk-path> image token, which the transcript parser then stripped.
    const record = rec({
      text: "look ![](/api/attachments/abc) done",
      resolvedText: "look @/disk/abc.png done",
    });
    const { records, changed } = matchPendingTurns(
      [record],
      [userText("look  done")],
      1000,
    );
    expect(changed).toBe(true);
    expect(records[0]!.state).toBe("sent");
    expect(records[0]!.matchedAt).toBe(1000);
  });

  test("stamps baseline on first pass so a pre-existing identical row never matches", () => {
    const events = [userText("hello world")];
    const first = matchPendingTurns([rec({ baselineUserText: null })], events);
    expect(first.changed).toBe(true);
    expect(first.records[0]!.baselineUserText).toBe(1);
    expect(first.records[0]!.state).toBe("posted");

    const second = matchPendingTurns(first.records, events);
    expect(second.changed).toBe(false);
    expect(second.records[0]!.state).toBe("posted");
  });

  test("matches only events past the baseline", () => {
    const events = [userText("hello world"), userText("hello world")];
    const { records } = matchPendingTurns([rec({ baselineUserText: 1 })], events);
    expect(records[0]!.state).toBe("sent");
    // Baseline 2 → both rows pre-existed → no match.
    const none = matchPendingTurns([rec({ baselineUserText: 2 })], events);
    expect(none.records[0]!.state).toBe("posted");
    expect(none.changed).toBe(false);
  });

  test("two identical in-flight messages consume distinct events", () => {
    const a = rec({ id: "a" });
    const b = rec({ id: "b" });
    const both = matchPendingTurns(
      [a, b],
      [userText("hello world"), userText("hello world")],
    );
    expect(both.records.map((r) => r.state)).toEqual(["sent", "sent"]);

    // One event only: the older record wins; the younger stays in flight.
    const one = matchPendingTurns([a, b], [userText("hello world")]);
    expect(one.records.map((r) => r.state)).toEqual(["sent", "posted"]);
  });

  test("user-text match wins over a queue-op enqueue match", () => {
    const { records } = matchPendingTurns(
      [rec()],
      [enqueue("hello world"), userText("hello world")],
    );
    expect(records[0]!.state).toBe("sent");
  });

  test("enqueue match upgrades to queued; delivery then upgrades to sent", () => {
    const queuedPass = matchPendingTurns([rec()], [enqueue("hello world")]);
    expect(queuedPass.records[0]!.state).toBe("queued");

    const sentPass = matchPendingTurns(queuedPass.records, [
      enqueue("hello world"),
      userText("hello world"),
    ]);
    expect(sentPass.records[0]!.state).toBe("sent");
  });

  test("a queued record re-consumes its enqueue row so a sibling cannot rebind it", () => {
    const a = rec({ id: "a", state: "queued" });
    const b = rec({ id: "b" });
    const { records } = matchPendingTurns([a, b], [enqueue("hello world")]);
    expect(records[0]!.state).toBe("queued");
    expect(records[1]!.state).toBe("posted");
  });

  test("a failed record whose text IS in the transcript is delivered, not failed", () => {
    // The send landed and only its verification failed (tmux submit-verify
    // timing out under load, a 500 raised after the paste). The transcript is
    // ground truth in both directions, so the failure card retires here.
    const failed = rec({
      id: "f",
      state: "failed-post",
      failureKind: "http",
      errorMessage: "HTTP 500",
    });
    const { records, changed } = matchPendingTurns([failed], [userText("hello world")]);
    expect(changed).toBe(true);
    expect(records[0]!.state).toBe("sent");
  });

  test("an unconfirmed record that lands late is delivered too", () => {
    const late = rec({ id: "u", state: "unconfirmed", reported: true });
    const { records } = matchPendingTurns([late], [userText("hello world")]);
    expect(records[0]!.state).toBe("sent");
  });

  test("a failed record found parked in the queue drops its failure metadata", () => {
    const failed = rec({
      id: "f",
      state: "failed-post",
      failureKind: "http",
      errorMessage: "HTTP 500",
    });
    const { records } = matchPendingTurns([failed], [enqueue("hello world")]);
    expect(records[0]!.state).toBe("queued");
    expect(records[0]!.failureKind).toBeUndefined();
    expect(records[0]!.errorMessage).toBeUndefined();
  });

  test("a failed record never steals the event of an in-flight sibling", () => {
    // Records are oldest-first and each event binds once: the failed record
    // consumes the row it matches, the sibling stays in flight.
    const failed = rec({ id: "f", state: "failed-post" });
    const inFlight = rec({ id: "p" });
    const { records } = matchPendingTurns([failed, inFlight], [userText("hello world")]);
    expect(records.map((r) => r.state)).toEqual(["sent", "posted"]);
  });

  test("a failed record with no transcript row stays failed", () => {
    const failed = rec({ id: "f", state: "failed-post", errorMessage: "HTTP 500" });
    const { records, changed } = matchPendingTurns([failed], [userText("something else")]);
    expect(changed).toBe(false);
    expect(records[0]!.state).toBe("failed-post");
    expect(records[0]!.errorMessage).toBe("HTTP 500");
  });

  test("an enqueue match retires the confirmation deadline", () => {
    // `queued` is transcript-confirmed: there is nothing left for the deadline
    // to catch, and an inherited (already elapsed) one would trip instantly.
    const late = rec({ state: "posted", deadlineAt: 500 });
    const { records } = matchPendingTurns([late], [enqueue("hello world")], 9_000);
    expect(records[0]!.state).toBe("queued");
    expect(records[0]!.deadlineAt).toBeUndefined();
  });
});

const CTX: SweepContext = { now: 10_000, tabId: "tab", liveInflight: new Set() };

describe("sweepPendingTurns", () => {
  test("drops reconciled records — the real user-text row is the feedback", () => {
    const { records, changed } = sweepPendingTurns([rec({ state: "sent" })], CTX);
    expect(changed).toBe(true);
    expect(records).toHaveLength(0);
  });

  test("adopts an owner-tab send left mid-flight by a reload", () => {
    const { records, reports } = sweepPendingTurns([rec({ state: "sending" })], CTX);
    expect(records[0]!.state).toBe("unconfirmed");
    expect(reports).toHaveLength(1);
  });

  test("leaves a send whose POST is still live in this tab alone", () => {
    const { changed } = sweepPendingTurns([rec({ state: "sending" })], {
      ...CTX,
      liveInflight: new Set(["r1"]),
    });
    expect(changed).toBe(false);
  });

  test("an elapsed deadline on a posted record trips unconfirmed, once", () => {
    const first = sweepPendingTurns([rec({ state: "posted", deadlineAt: 9_000 })], CTX);
    expect(first.records[0]!.state).toBe("unconfirmed");
    expect(first.reports).toHaveLength(1);
    // The deadline is spent, so a second pass is inert and files nothing more.
    const second = sweepPendingTurns(first.records, CTX);
    expect(second.changed).toBe(false);
    expect(second.reports).toHaveLength(0);
  });

  test("never revokes a transcript-resolved record, whatever the deadline says", () => {
    // A queued record is parked in the CLI's own prompt queue — the transcript
    // says so. No deadline may take that back.
    const queued = rec({ state: "queued", deadlineAt: 1 });
    const { records, changed, reports } = sweepPendingTurns([queued], CTX);
    expect(changed).toBe(false);
    expect(records[0]!.state).toBe("queued");
    expect(reports).toHaveLength(0);
  });
});

describe("the reconcile transition is a fixed point", () => {
  // The pane drives this pipeline from a render effect and the store notifies
  // its React subscribers whenever a pass reports `changed` — so a pair of
  // transitions that can undo each other is an unbounded synchronous update
  // loop (React "Maximum update depth exceeded"), not a cosmetic flip-flop.
  // Every state must therefore settle in ONE pass against a fixed transcript.
  const pass = (records: PendingTurnRecord[], events: JsonlEvent[]) => {
    const matched = matchPendingTurns(records, events, CTX.now);
    const swept = sweepPendingTurns(matched.records, CTX);
    return { records: swept.records, changed: matched.changed || swept.changed };
  };

  const STATES: PendingTurnState[] = [
    "sending",
    "posted",
    "queued",
    "sent",
    "failed-post",
    "unconfirmed",
  ];
  const TRANSCRIPTS: [string, JsonlEvent[]][] = [
    ["empty", []],
    ["enqueued", [enqueue("hello world")]],
    ["delivered", [userText("hello world")]],
    ["enqueued then delivered", [enqueue("hello world"), userText("hello world")]],
    ["unrelated", [userText("something else"), enqueue("something else")]],
  ];

  for (const state of STATES) {
    for (const [label, events] of TRANSCRIPTS) {
      test(`${state} + ${label} settles in one pass`, () => {
        // Worst case for the deadline paths: an elapsed deadline and a live
        // POST nowhere to be found — exactly the shape that used to ping-pong.
        const start = [
          rec({ state, deadlineAt: 1, reported: state === "unconfirmed" }),
        ];
        const first = pass(start, events);
        const second = pass(first.records, events);
        expect(second.changed).toBe(false);
        expect(second.records).toBe(first.records);
      });
    }
  }

  test("regression: an unconfirmed record still parked in the queue settles", () => {
    // The crash: the matcher promoted unconfirmed → queued off the enqueue row,
    // the sweep demoted it straight back on the inherited elapsed deadline, and
    // each lap committed + notified inside the pane's effect.
    const stuck = rec({
      state: "unconfirmed",
      reported: true,
      deadlineAt: 1,
      errorMessage: "Not confirmed",
    });
    const first = pass([stuck], [enqueue("hello world")]);
    expect(first.changed).toBe(true);
    expect(first.records[0]!.state).toBe("queued");
    expect(pass(first.records, [enqueue("hello world")]).changed).toBe(false);
  });
});

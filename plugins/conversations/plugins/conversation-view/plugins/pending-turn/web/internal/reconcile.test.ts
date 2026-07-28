import { describe, expect, test } from "bun:test";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { matchPendingTurns, normalizeForMatch } from "./reconcile";
import type { PendingTurnRecord } from "./store";

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
});

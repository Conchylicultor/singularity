import { describe, expect, test } from "bun:test";
import type { QueryDeadlineEvent } from "@plugins/database/server";
import type { recordReport } from "@plugins/reports/server";
import {
  DbAbandonCapPayloadSchema,
  DbQueryDeadlinePayloadSchema,
  QUERY_DEADLINE_RING_CAPACITY,
  QueryDeadlinesSchema,
} from "../../core";
import { createQueryDeadlineHandler } from "./handler";
import { createHitRing } from "./hit-ring";
import { abandonCapFingerprint, queryDeadlineFingerprint } from "./render";

type ReportInput = Parameters<typeof recordReport>[0];

function harness() {
  const calls: string[] = [];
  const recorded: ReportInput[] = [];
  const ring = createHitRing(QUERY_DEADLINE_RING_CAPACITY);
  const handle = createQueryDeadlineHandler({
    recordReport: (input) => {
      calls.push("record");
      recorded.push(input);
      return Promise.resolve({
        outcome: "recorded",
        reportId: "r1",
        taskId: null,
        rateLimited: false,
      });
    },
    ring,
    notify: () => {
      calls.push("notify");
    },
  });
  return { calls, recorded, ring, handle };
}

const deadline: QueryDeadlineEvent = {
  kind: "deadline",
  at: 1_789_120_000_000,
  sql: "select count(*) from conversations_v",
  elapsedMs: 60_004,
  deadlineMs: 60_000,
  origin: "push conversations-gone-stats",
  leased: false,
  reason: null,
};

describe("deadline event", () => {
  test("files one db-query-deadline report whose payload the kind accepts", () => {
    const h = harness();
    h.handle(deadline);

    expect(h.recorded).toHaveLength(1);
    const input = h.recorded[0]!;
    expect(input.kind).toBe("db-query-deadline");
    expect(input.source).toBe("server-caught");
    expect(input.message).toBe(
      "A database query got no answer for 60s and was abandoned: select count(*) from conversations_v",
    );
    // The payload is exactly what the kind's schema validates on ingest — no
    // `at` (the row has its own first/last-seen), nothing dropped.
    expect(DbQueryDeadlinePayloadSchema.parse(input.data)).toEqual({
      sql: deadline.sql,
      elapsedMs: 60_004,
      deadlineMs: 60_000,
      origin: "push conversations-gone-stats",
      leased: false,
      reason: null,
    });
  });

  test("fingerprints on the query label, so repeats of one query share a row", () => {
    const h = harness();
    h.handle(deadline);
    h.handle({
      ...deadline,
      at: deadline.at + 1,
      elapsedMs: 61_000,
      leased: true,
    });
    h.handle({ ...deadline, sql: "select 1" });

    const prints = h.recorded.map((r) =>
      queryDeadlineFingerprint(DbQueryDeadlinePayloadSchema.parse(r.data)),
    );
    expect(prints).toEqual([
      "db-query-deadline:select count(*) from conversations_v",
      "db-query-deadline:select count(*) from conversations_v",
      "db-query-deadline:select 1",
    ]);
  });

  test("records the hit in the ring and pushes it BEFORE the report write", () => {
    const h = harness();
    h.handle(deadline);

    expect(h.ring.snapshot()).toEqual([
      { at: deadline.at, sql: deadline.sql, elapsedMs: 60_004 },
    ]);
    // The row must turn even when the report write is what cannot reach the DB.
    expect(h.calls).toEqual(["notify", "record"]);
  });
});

describe("abandon-cap event", () => {
  test("files one rolling db-abandon-cap report and leaves the ring alone", () => {
    const h = harness();
    h.handle({ kind: "abandon-cap", at: 1, abandoned: 33, cap: 32 });

    expect(h.recorded).toHaveLength(1);
    const input = h.recorded[0]!;
    expect(input.kind).toBe("db-abandon-cap");
    expect(input.source).toBe("server-caught");
    expect(input.message).toBe(
      "33 database connections have been abandoned since the server started — more than the 32 it is built to hold",
    );
    expect(DbAbandonCapPayloadSchema.parse(input.data)).toEqual({
      abandoned: 33,
      cap: 32,
    });
    expect(abandonCapFingerprint()).toBe("db-abandon-cap");
    expect(h.ring.snapshot()).toEqual([]);
    expect(h.calls).toEqual(["record"]);
  });
});

describe("hit ring", () => {
  test("keeps only the last 20 hits, oldest first", () => {
    const h = harness();
    for (let i = 0; i < 25; i++) h.handle({ ...deadline, at: i });

    const hits = h.ring.snapshot();
    expect(hits).toHaveLength(20);
    expect(hits[0]!.at).toBe(5);
    expect(hits.at(-1)!.at).toBe(24);
    // Every hit pushes, whether or not it evicted one.
    expect(h.calls.filter((c) => c === "notify")).toHaveLength(25);
  });

  test("the ring's bound is the resource schema's bound", () => {
    const hit = { at: 0, sql: "select 1", elapsedMs: 1 };
    const full = Array.from(
      { length: QUERY_DEADLINE_RING_CAPACITY },
      () => hit,
    );
    expect(QueryDeadlinesSchema.safeParse({ hits: full }).success).toBe(true);
    expect(
      QueryDeadlinesSchema.safeParse({ hits: [...full, hit] }).success,
    ).toBe(false);
  });

  test("snapshot is a copy the loader can hand off", () => {
    const ring = createHitRing(2);
    ring.push({ at: 1, sql: "a", elapsedMs: 1 });
    const snap = ring.snapshot();
    ring.push({ at: 2, sql: "b", elapsedMs: 1 });
    expect(snap).toHaveLength(1);
  });

  test("refuses a capacity that could not hold a hit", () => {
    expect(() => createHitRing(0)).toThrow(/positive integer/);
    expect(() => createHitRing(1.5)).toThrow(/positive integer/);
  });
});

/**
 * Suite for shed-replay timestamp honesty (Stage 4 of
 * research/2026-07-11-global-observability-freeze-blind-spots.md): a slow-op
 * buffered during a duress episode replays with its true in-freeze
 * `occurredAt`, and an out-of-order replay can never regress last_seen_at or
 * clobber fresher last-* attribution. The greatest/least + newest-occurrence
 * guards live in SQL, so the DB half drives the db-parametrized upsertSlowOp
 * against a throwaway Postgres (db-test-fixture) seeded with the REAL
 * migration chain; the ring ordering is pure and tested directly.
 *
 * Run: `bun test plugins/debug/plugins/slow-ops/server/internal`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import type { ContentionSnapshot } from "@plugins/infra/plugins/contention/server";
import type { SlowOpSample } from "../../core";
import {
  mergeSample,
  upsertSlowOp,
  type RecordSlowOpInput,
} from "./record-slow-op";
import { _slowOps } from "./tables";

const T0 = new Date("2026-07-11T03:30:00.000Z");
const T1 = new Date("2026-07-11T03:32:00.000Z");
const T2 = new Date("2026-07-11T03:34:00.000Z");

const snapshot = (atTime: Date): ContentionSnapshot => ({
  atTime,
  loadAvg1: 1,
  loadAvg5: 1,
  loadAvg15: 1,
  cpuCount: 8,
  pgActiveBackends: 1,
  pgTotalBackends: 2,
  pgTopDatabases: [],
});

const input = (over: Partial<RecordSlowOpInput> = {}): RecordSlowOpInput => ({
  operationKind: "loader",
  operation: "test-op",
  durationMs: 100,
  thresholdMs: 50,
  source: "server-slow-op",
  ...over,
});

describe("mergeSample", () => {
  test("stamps the sample at its occurredAt, not the write instant", () => {
    const [newest] = mergeSample([], snapshot(T1), 100, undefined, T1);
    expect(newest?.atTime).toBe(T1);
  });

  test("an older replayed sample sorts behind an already-present newer one", () => {
    const ring = mergeSample([], snapshot(T2), 100, undefined, T2);
    const merged = mergeSample(ring, snapshot(T1), 200, undefined, T1);
    expect(merged.map((s) => s.atTime)).toEqual([T2, T1]);
  });

  test("orders against jsonb-round-tripped entries whose atTime is an ISO string", () => {
    // A sample read back from the jsonb column carries atTime as an ISO
    // string at runtime despite the Date-typed schema — the sort must
    // normalize both representations.
    const persisted = [
      { atTime: T2.toISOString(), durationMs: 100, snapshot: snapshot(T2) },
    ] as unknown as SlowOpSample[];
    const merged = mergeSample(persisted, snapshot(T1), 200, undefined, T1);
    expect(merged.map((s) => new Date(s.atTime).getTime())).toEqual([
      T2.getTime(),
      T1.getTime(),
    ]);
  });

  test("caps the ring at the newest 10 by time, dropping the oldest", () => {
    let ring: SlowOpSample[] = [];
    for (let i = 0; i < 10; i++) {
      const at = new Date(T1.getTime() + (i + 1) * 1000);
      ring = mergeSample(ring, snapshot(at), 100, undefined, at);
    }
    // A replayed sample older than everything in a full ring is not among the
    // newest 10 — it drops instead of evicting a newer entry.
    const merged = mergeSample(ring, snapshot(T0), 200, undefined, T0);
    expect(merged).toHaveLength(10);
    expect(merged.some((s) => new Date(s.atTime).getTime() === T0.getTime())).toBe(
      false,
    );
  });
});

describe("upsertSlowOp (real DB)", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb({ prefix: "slowop_test" });
    await runMigrations(t.db);
  });

  afterAll(async () => {
    await t.drop();
  });

  beforeEach(async () => {
    await t.db.execute(sql`DELETE FROM slow_ops`);
  });

  async function readRow() {
    const rows = await t.db.select().from(_slowOps);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  test("a shed-then-replayed op lands at its original occurredAt, not write time", async () => {
    // T1 is minutes in the past relative to the write — exactly a duress-shed
    // item replayed after the episode cleared.
    await upsertSlowOp(input(), T1, snapshot(T1), t.db);

    const row = await readRow();
    expect(row.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row.lastSeenAt.getTime()).toBe(T1.getTime());
    expect(new Date(row.recentSamples[0]!.atTime).getTime()).toBe(T1.getTime());
  });

  test("an out-of-order replay never regresses timestamps or clobbers last-* attribution", async () => {
    // A live op lands first (T2), then an in-freeze item from EARLIER (T1)
    // replays after it — the interleaving the flush can produce.
    await upsertSlowOp(input({ durationMs: 100, thresholdMs: 50 }), T2, snapshot(T2), t.db);
    await upsertSlowOp(input({ durationMs: 200, thresholdMs: 75 }), T1, snapshot(T1), t.db);

    const row = await readRow();
    // Aggregates accumulate order-insensitively.
    expect(row.count).toBe(2);
    expect(row.totalMs).toBe(300);
    expect(row.maxMs).toBe(200);
    // Timestamps: last never regresses, first pulls back to the true onset.
    expect(row.lastSeenAt.getTime()).toBe(T2.getTime());
    expect(row.firstSeenAt.getTime()).toBe(T1.getTime());
    // last-* attribution still describes the NEWEST occurrence (T2), not the
    // replayed older one.
    expect(row.lastMs).toBe(100);
    expect(row.thresholdMs).toBe(50);
    // The ring is newest-first by true time despite the arrival order.
    expect(row.recentSamples.map((s) => new Date(s.atTime).getTime())).toEqual([
      T2.getTime(),
      T1.getTime(),
    ]);
  });

  test("a genuinely newer occurrence advances last_seen_at and takes over last-* attribution", async () => {
    await upsertSlowOp(input({ durationMs: 200, thresholdMs: 75 }), T1, snapshot(T1), t.db);
    await upsertSlowOp(input({ durationMs: 100, thresholdMs: 50 }), T2, snapshot(T2), t.db);

    const row = await readRow();
    expect(row.lastSeenAt.getTime()).toBe(T2.getTime());
    expect(row.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row.lastMs).toBe(100);
    expect(row.thresholdMs).toBe(50);
  });
});

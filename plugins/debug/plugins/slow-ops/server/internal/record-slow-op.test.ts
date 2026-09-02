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

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
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
  upsertSlowOpIn,
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
    expect(
      merged.some((s) => new Date(s.atTime).getTime() === T0.getTime()),
    ).toBe(false);
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
    await upsertSlowOp(
      input({ durationMs: 100, thresholdMs: 50 }),
      T2,
      snapshot(T2),
      t.db,
    );
    await upsertSlowOp(
      input({ durationMs: 200, thresholdMs: 75 }),
      T1,
      snapshot(T1),
      t.db,
    );

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
    await upsertSlowOp(
      input({ durationMs: 200, thresholdMs: 75 }),
      T1,
      snapshot(T1),
      t.db,
    );
    await upsertSlowOp(
      input({ durationMs: 100, thresholdMs: 50 }),
      T2,
      snapshot(T2),
      t.db,
    );

    const row = await readRow();
    expect(row.lastSeenAt.getTime()).toBe(T2.getTime());
    expect(row.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row.lastMs).toBe(100);
    expect(row.thresholdMs).toBe(50);
  });
});

describe("upsertSlowOpIn (real DB, one transaction per batch)", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb({ prefix: "slowop_batch_test" });
    await runMigrations(t.db);
  });

  afterAll(async () => {
    await t.drop();
  });

  beforeEach(async () => {
    await t.db.execute(sql`DELETE FROM slow_ops`);
  });

  // The client beacon arrives as a batch and recordSlowOpBatch drives every
  // item through ONE transaction — the whole point of the batching, since a
  // transaction per item is what amplified the stall it reports. What the
  // shared transaction must NOT change is the per-item semantics, so drive the
  // same body the batch drives and assert each item still lands on its own key
  // with its own attribution.
  test("distinct operations in one transaction each get their own row", async () => {
    await t.db.transaction(async (tx) => {
      await upsertSlowOpIn(tx, input({ operation: "op-a" }), T1, snapshot(T1));
      await upsertSlowOpIn(tx, input({ operation: "op-b" }), T1, snapshot(T1));
    });

    const rows = await t.db.select().from(_slowOps);
    expect(rows.map((r) => r.operation).sort()).toEqual(["op-a", "op-b"]);
    for (const row of rows) {
      expect(row.count).toBe(1);
      expect(row.lastSeenAt.getTime()).toBe(T1.getTime());
    }
  });

  // Two settles of the SAME resource inside one boot wave land in one batch, so
  // both hit the same row through the same transaction. The onConflictDoUpdate
  // accumulation has to hold within a transaction exactly as it does across
  // them — the second insert must see the first one's row.
  test("repeats of one operation in the same transaction accumulate onto one row", async () => {
    await t.db.transaction(async (tx) => {
      await upsertSlowOpIn(
        tx,
        input({ durationMs: 100, thresholdMs: 50 }),
        T1,
        snapshot(T1),
      );
      await upsertSlowOpIn(
        tx,
        input({ durationMs: 300, thresholdMs: 50 }),
        T2,
        snapshot(T2),
      );
    });

    const rows = await t.db.select().from(_slowOps);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.count).toBe(2);
    expect(row.totalMs).toBe(400);
    expect(row.maxMs).toBe(300);
    expect(row.lastMs).toBe(300);
    expect(row.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row.lastSeenAt.getTime()).toBe(T2.getTime());
    // Both samples are in the ring, newest first.
    expect(row.recentSamples.map((s) => new Date(s.atTime).getTime())).toEqual([
      T2.getTime(),
      T1.getTime(),
    ]);
  });

  // Per-item caller attribution survives the shared transaction: two routes
  // waiting on the same resource in one batch both appear in the breakdown.
  test("per-item callers merge independently within one transaction", async () => {
    await t.db.transaction(async (tx) => {
      await upsertSlowOpIn(
        tx,
        input({ caller: { kind: "route", label: "/a" } }),
        T1,
        snapshot(T1),
      );
      await upsertSlowOpIn(
        tx,
        input({ caller: { kind: "route", label: "/b" } }),
        T1,
        snapshot(T1),
      );
      await upsertSlowOpIn(
        tx,
        input({ caller: { kind: "route", label: "/a" } }),
        T1,
        snapshot(T1),
      );
    });

    const rows = await t.db.select().from(_slowOps);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.callers.map((c) => [c.label, c.count]).sort()).toEqual([
      ["/a", 2],
      ["/b", 1],
    ]);
  });

  // A batch is all-or-nothing: one item's failure rolls the whole transaction
  // back. That is the deliberate trade the shared transaction makes, so pin it
  // rather than leave it to be discovered.
  test("a throw inside the batch transaction rolls back every item in it", async () => {
    const boom = new Error("batch item failed");
    let rejected = false;
    await t.db
      .transaction(async (tx) => {
        await upsertSlowOpIn(
          tx,
          input({ operation: "op-a" }),
          T1,
          snapshot(T1),
        );
        throw boom;
      })
      .catch((err: unknown) => {
        // Only OUR failure is expected here; anything else is a real problem
        // and must keep propagating.
        if (err !== boom) throw err;
        rejected = true;
      });
    expect(rejected).toBe(true);

    const rows = await t.db.select().from(_slowOps);
    expect(rows).toHaveLength(0);
  });
});

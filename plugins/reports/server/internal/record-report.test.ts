/**
 * Suite for shed-replay timestamp honesty (Stage 4 of
 * research/2026-07-11-global-observability-freeze-blind-spots.md): a report
 * buffered during a duress episode replays with its true in-freeze
 * `occurredAt`, and an out-of-order replay can never move last_seen_at
 * backwards (or first_seen_at forwards) nor clobber fresher last-writer-wins
 * attribution. Those semantics live in the ON CONFLICT SQL, so this drives the
 * db-parametrized upsertReport against a throwaway Postgres (db-test-fixture)
 * seeded with the REAL migration chain.
 *
 * Run: `bun test plugins/reports/server/internal`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { upsertReport, type ReportUpsertValues } from "./record-report";
import { _reports } from "./tables";

const T0 = new Date("2026-07-11T03:30:00.000Z");
const T1 = new Date("2026-07-11T03:32:00.000Z");
const T2 = new Date("2026-07-11T03:34:00.000Z");

let seq = 0;
const values = (over: Partial<ReportUpsertValues> = {}): ReportUpsertValues => ({
  id: `report-test-${seq++}`,
  kind: "crash",
  fingerprint: "fp-1",
  worktree: "wt-test",
  source: "server-crash",
  message: "m",
  url: null,
  userAgent: null,
  data: {},
  limited: false,
  noise: false,
  clientId: null,
  buildId: null,
  occurredAt: T1,
  ...over,
});

describe("upsertReport (real DB)", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb({ prefix: "report_test" });
    await runMigrations(t.db);
  });

  afterAll(async () => {
    await t.drop();
  });

  beforeEach(async () => {
    await t.db.execute(sql`DELETE FROM reports`);
  });

  test("a shed-then-replayed report lands at its original occurredAt, not write time", async () => {
    // T1 is minutes in the past relative to the write — exactly a duress-shed
    // report replayed after the episode cleared.
    const [row] = await upsertReport(values({ occurredAt: T1 }), t.db);

    expect(row?.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row?.lastSeenAt.getTime()).toBe(T1.getTime());
  });

  test("a replayed older report never moves last_seen_at backwards, and pulls first_seen_at to the true onset", async () => {
    await upsertReport(values({ occurredAt: T1, message: "newest" }), t.db);
    const [row] = await upsertReport(
      values({
        occurredAt: T0,
        message: "in-freeze",
        data: { stale: true },
        clientId: "old-tab",
      }),
      t.db,
    );

    expect(row?.count).toBe(2);
    expect(row?.lastSeenAt.getTime()).toBe(T1.getTime());
    expect(row?.firstSeenAt.getTime()).toBe(T0.getTime());
    // Last-writer-wins attribution still describes the NEWEST occurrence.
    expect(row?.message).toBe("newest");
    expect(row?.data).toEqual({});
    expect(row?.lastClientId).toBeNull();
  });

  test("a genuinely newer repeat advances last_seen_at and takes over attribution", async () => {
    await upsertReport(values({ occurredAt: T1, message: "old" }), t.db);
    const [row] = await upsertReport(
      values({ occurredAt: T2, message: "new", data: { n: 2 }, clientId: "tab-2" }),
      t.db,
    );

    expect(row?.count).toBe(2);
    expect(row?.lastSeenAt.getTime()).toBe(T2.getTime());
    expect(row?.firstSeenAt.getTime()).toBe(T1.getTime());
    expect(row?.message).toBe("new");
    expect(row?.data).toEqual({ n: 2 });
    expect(row?.lastClientId).toBe("tab-2");
  });
});

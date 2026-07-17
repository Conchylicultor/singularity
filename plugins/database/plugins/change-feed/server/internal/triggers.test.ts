import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { rebuildTriggers } from "./triggers";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";

// Real-DB trigger-rebuild suite, pinning the SKIP-WHEN-UNCHANGED contract.
//
// The rebuild holds an AccessExclusive lock on every public table until commit, so
// on a hot-swap restart (previous backend still reading, sibling onReadyBlocking
// hooks racing) it could deadlock and take boot down with it — build
// build-1784288281433-w62dep died exactly that way. The fix is to skip the rebuild
// (and its lock window) when the live trigger layer already IS the desired one, so
// "did it skip?" is now a load-bearing property and belongs under test.
//
// The witness for skip-vs-rebuild is TRIGGER OID IDENTITY: a rebuild is
// DROP+CREATE, which necessarily mints a new pg_trigger row (new oid). Unchanged
// oids across two calls therefore prove no DROP+CREATE ran — the actual property,
// observed directly rather than through a spy or a log line.
//
// Requires a running Postgres cluster (started by ./singularity build). If the
// cluster is unreachable, createTestDb() throws loudly rather than skipping.

let testDb: TestDb;

// The feed's own trigger rows, keyed name → oid, for the tables this suite makes.
async function triggerOids(): Promise<Map<string, string>> {
  const res = await testDb.db.execute<{ tgname: string; oid: string }>(
    sql`SELECT t.tgname, t.oid::text AS oid
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND NOT t.tgisinternal
          AND t.tgname LIKE 'live_state_%'
        ORDER BY t.tgname`,
  );
  return new Map(res.rows.map((r) => [r.tgname, r.oid]));
}

beforeAll(async () => {
  testDb = await createTestDb({ prefix: "cf_trig_test" });
  await testDb.db.execute(sql`CREATE TABLE widgets (id text PRIMARY KEY, name text)`);
});

afterAll(async () => {
  await testDb?.drop();
});

describe("rebuildTriggers", () => {
  test("installs the feed on a public table", async () => {
    await rebuildTriggers(testDb.db);

    const oids = await triggerOids();
    expect([...oids.keys()]).toEqual([
      "live_state_widgets_d",
      "live_state_widgets_i",
      "live_state_widgets_u",
    ]);
  });

  test("skips an unchanged rebuild — same trigger oids, no DROP+CREATE", async () => {
    const before = await triggerOids();
    await rebuildTriggers(testDb.db);
    const after = await triggerOids();

    // Identical oids ⇒ the rows were never dropped and recreated ⇒ the rebuild
    // (and its whole-database exclusive-lock window) was skipped.
    expect(after).toEqual(before);
  });

  test("rebuilds when a trigger was dropped out of band — the signature alone is not trusted", async () => {
    const before = await triggerOids();
    await testDb.db.execute(sql`DROP TRIGGER live_state_widgets_u ON widgets`);

    // The stored signature still matches (nothing about the desired layer changed),
    // so only the physical-presence guard can catch this.
    await rebuildTriggers(testDb.db);

    const after = await triggerOids();
    expect([...after.keys()]).toEqual([...before.keys()]);
    // Fresh oids: a real rebuild ran rather than a false skip.
    expect(after.get("live_state_widgets_i")).not.toBe(before.get("live_state_widgets_i"));
  });

  test("rebuilds when a new table appears — the signature tracks the schema", async () => {
    const before = await triggerOids();
    await testDb.db.execute(sql`CREATE TABLE gadgets (id text PRIMARY KEY)`);

    await rebuildTriggers(testDb.db);

    const after = await triggerOids();
    expect([...after.keys()]).toEqual([
      "live_state_gadgets_d",
      "live_state_gadgets_i",
      "live_state_gadgets_u",
      "live_state_widgets_d",
      "live_state_widgets_i",
      "live_state_widgets_u",
    ]);
    expect(after.get("live_state_widgets_i")).not.toBe(before.get("live_state_widgets_i"));
  });

  test("skips again once the new table's feed is installed", async () => {
    const before = await triggerOids();
    await rebuildTriggers(testDb.db);
    expect(await triggerOids()).toEqual(before);
  });
});

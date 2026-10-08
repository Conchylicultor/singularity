/**
 * Legacy readers of the task-tree VIEWS through the real feed (P8 steps 23–24,
 * 23a; C30): a non-routed loader records the view it read (`tasks_v`,
 * `attempts_v`), and the router reaches it through the view's relation bases —
 * the tables the view reads, transitively, with each rollup replaced by its
 * sources. Since step 19 `tasks_v` and `attempts_v` read `conversations` and
 * `pushes` only through the feed-exempt rollups, so before relation bases a
 * conversation or push write reached no legacy reader of them at all (the
 * `automations.catalog` silent-stale case, §2).
 *
 * One throwaway database with the migration chain and this plugin's derived
 * layer (rollups and views), the feed's triggers, its LISTEN consumer and its
 * own routing (`createChangeRouter`) into a runtime of the suite's own whose
 * `relationBases` are built from the database's own view graph — exactly what
 * change-feed sets at boot. Each change must reach each reader of it exactly
 * once, and nothing else: a write to a table no view reads is the negative
 * control, and its own reader the positive one.
 *
 * Requires a running Postgres cluster (started by ./singularity build).
 * Run: `./singularity test plugins/tasks/plugins/tasks-core`.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import { runMigrations } from "@plugins/database/plugins/migrations/server/testing";
import type { FeedChange } from "@plugins/database/plugins/change-feed/server";
import {
  buildViewDeps,
  createChangeFeedListener,
  createChangeRouter,
  createRelationBases,
  rebuildTriggers,
} from "@plugins/database/plugins/change-feed/server/testing";
import { createResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import { installTaskDerivedSchema, TREE_IDS, treeSeed } from "../testing";
import { rollupSourcesOf } from "@plugins/database/plugins/derived-tables/server/testing";
import { TASK_ROLLUPS } from "./rollup-spec";

const TASKS_V = "test.legacy-forwarding.tasks_v";
const ATTEMPTS_V = "test.legacy-forwarding.attempts_v";
const UNRELATED = "test.legacy-forwarding.unrelated";
const KEYS = [TASKS_V, ATTEMPTS_V, UNRELATED] as const;

// What each loader records in its read-set — the relation it names, as the
// DB pool chokepoint captures it.
const READS: Record<string, string[]> = {
  [TASKS_V]: ["tasks_v"],
  [ATTEMPTS_V]: ["attempts_v"],
  [UNRELATED]: ["lf_unrelated"],
};

const StatusRowsSchema = z.array(
  z.object({ id: z.string(), status: z.string() }),
);

let testDb: TestDb;
let listener: ReturnType<typeof createChangeFeedListener> | null = null;
let closeSocket: (() => void) | null = null;
const loads: string[] = [];
const routed: FeedChange[] = [];
const failures: string[] = [];

async function until(cond: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

// Run one write, wait for its change to route, then for the runtime to go
// quiet; return the loads it caused, per key.
async function write(statement: string): Promise<Record<string, number>> {
  const fromRouted = routed.length;
  const fromLoads = loads.length;
  await testDb.db.execute(sql.raw(statement));
  await until(() => routed.length > fromRouted, `the change of: ${statement}`);
  for (;;) {
    const at = `${routed.length}:${loads.length}`;
    await new Promise((r) => setTimeout(r, 150));
    if (`${routed.length}:${loads.length}` === at) break;
  }
  expect(failures).toEqual([]);
  const out: Record<string, number> = Object.fromEntries(
    KEYS.map((k) => [k, 0]),
  );
  for (const key of loads.slice(fromLoads)) out[key] = out[key]! + 1;
  return out;
}

beforeAll(async () => {
  testDb = await createTestDb({ prefix: "tc_legacy_fwd" });
  await runMigrations(testDb.db);
  await installTaskDerivedSchema(testDb.db);
  await testDb.db.execute(
    sql`CREATE TABLE lf_unrelated (id text PRIMARY KEY, n integer NOT NULL)`,
  );
  await testDb.db.execute(sql`INSERT INTO lf_unrelated VALUES ('u', 1)`);
  for (const step of treeSeed()) {
    for (const statement of step.statements) {
      await testDb.db.execute(sql.raw(statement));
    }
  }

  // The relation graph change-feed reads at boot, from this database: its
  // views, and the rollups this plugin contributes mapped to their sources by
  // the same function `rollupSources()` applies to the contributions.
  const relationBases = createRelationBases({
    views: await buildViewDeps(testDb.db),
    rollups: rollupSourcesOf(TASK_ROLLUPS),
  });
  const runtime = createResourceRuntime({
    readSet: (key) => READS[key] ?? [],
    relationBases,
    reportError: (context, err) => {
      failures.push(
        `${context}: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });
  const statusesOf = (relation: string) => async () => {
    const res = await testDb.db.execute(
      sql.raw(`SELECT id, status::text AS status FROM ${relation} ORDER BY id`),
    );
    return StatusRowsSchema.parse(res.rows);
  };
  for (const [key, load] of [
    [TASKS_V, statusesOf("tasks_v")],
    [ATTEMPTS_V, statusesOf("attempts_v")],
    [
      UNRELATED,
      async () => {
        const res = await testDb.db.execute(
          sql`SELECT id, n::text AS status FROM lf_unrelated ORDER BY id`,
        );
        return StatusRowsSchema.parse(res.rows);
      },
    ],
  ] as const) {
    runtime.defineResource(
      { key, schema: StatusRowsSchema, validateParams: () => {} },
      {
        mode: "push",
        loader: () => {
          loads.push(key);
          return load();
        },
      },
    );
  }

  // One socket subscribed to each reader's `{}` tuple.
  const handler = runtime.notificationsWsHandler as unknown as {
    open(ws: unknown): void;
    message(ws: unknown, raw: string): void;
    close(ws: unknown, code: number, reason: string): void;
  };
  const acked = new Set<string>();
  const ws = {
    send(raw: string) {
      const frame = JSON.parse(raw) as { kind: string; key?: string };
      if (frame.kind === "sub-ack" && frame.key) acked.add(frame.key);
    },
  };
  handler.open(ws);
  closeSocket = () => handler.close(ws, 1000, "test");
  for (const key of KEYS) {
    handler.message(ws, JSON.stringify({ op: "sub", key, params: {} }));
  }
  await until(() => KEYS.every((k) => acked.has(k)), "every sub-ack");

  // The feed: rollups are feed-exempt, as at boot.
  await rebuildTriggers(
    testDb.db,
    {
      feedExempt: new Set(TASK_ROLLUPS.map((r) => r.table)),
      optedOut: new Set(),
      produced: new Set(),
    },
    [],
  );
  const tables = (
    await testDb.db.execute<{ t: string }>(
      sql`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`,
    )
  ).rows.map((r) => r.t);
  const routeChange = createChangeRouter(runtime);
  listener = createChangeFeedListener({
    connectionString: () => testDb.connectionString,
    route: (change) => {
      routed.push(change);
      routeChange(change);
    },
    coveredTables: () => tables,
    livenessIntervalMs: 60_000,
  });
  listener.start();
  const deadline = Date.now() + 10_000;
  for (;;) {
    const res = await testDb.db.execute(
      sql`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database()
            AND query LIKE 'LISTEN live_state%'
            AND pid <> pg_backend_pid()`,
    );
    if (res.rows.length > 0) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for LISTEN");
    await new Promise((r) => setTimeout(r, 20));
  }
}, 60_000);

afterAll(async () => {
  closeSocket?.();
  await listener?.stop();
  await testDb?.drop();
});

describe("legacy readers of a view are reached through its relation bases", () => {
  const [C1] = TREE_IDS.conversations;
  const [, A2] = TREE_IDS.attempts;

  test("a conversations write reaches a reader of tasks_v (through attempt_conv_agg) exactly once", async () => {
    expect(
      await write(
        `UPDATE conversations SET status = 'waiting' WHERE id = '${C1}'`,
      ),
    ).toEqual({ [TASKS_V]: 1, [ATTEMPTS_V]: 1, [UNRELATED]: 0 });
  }, 20_000);

  test("a pushes write reaches a reader of attempts_v (through attempt_push_agg) exactly once", async () => {
    expect(
      await write(
        `INSERT INTO pushes (id, sha, message, push_id, attempt_id, conversation_id)
         VALUES ('lf-p9', 'lf-p9-sha', 'lf-p9 message', 'lf-p9-push', '${A2}', '${TREE_IDS.conversations[1]}')`,
      ),
    ).toEqual({ [TASKS_V]: 1, [ATTEMPTS_V]: 1, [UNRELATED]: 0 });
  }, 20_000);

  test("a write to a table no view reads reaches only its own reader", async () => {
    expect(await write(`UPDATE lf_unrelated SET n = 2 WHERE id = 'u'`)).toEqual(
      { [TASKS_V]: 0, [ATTEMPTS_V]: 0, [UNRELATED]: 1 },
    );
  }, 20_000);
});

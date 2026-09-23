import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { compileCreateView } from "@plugins/database/plugins/derived-views/core";
import {
  attemptConvAggSpec,
  attemptPushAggSpec,
} from "../internal/rollup-spec";
import {
  attempts,
  conversations,
  taskBlocking,
  tasks,
} from "../internal/views";

// Install this plugin's derived layer — the two attempt rollups and the four
// views — onto a database that has only the migration chain: a `createTestDb`
// throwaway. At boot the same DDL comes from `rebuildDerivedTables` /
// `rebuildDerivedViews` over this plugin's contributions; a headless suite has
// no plugin registry, so it compiles the SAME exported declarations here, and
// the SQL under test is byte-identical to what a backend installs.
//
// For suites outside this plugin that drive tasks-core writes on a throwaway —
// a status batch reads `tasks_v`, and `createAttempt` / `insertConversation`
// read `attempts_v` / `conversations_v` back.
export async function installTaskDerivedSchema(
  db: NodePgDatabase,
): Promise<void> {
  // The migration chain still contains the historical CREATE VIEW statements
  // from before plain views became derived code, so drop whatever it left
  // behind first (CASCADE: tasks_v reads attempts_v).
  for (const name of [
    "tasks_v",
    "task_blocking_v",
    "conversations_v",
    "attempts_v",
  ]) {
    await db.execute(sql.raw(`DROP VIEW IF EXISTS "public"."${name}" CASCADE`));
  }

  // attempts_v LEFT JOINs the two trigger-maintained rollups.
  for (const spec of [attemptConvAggSpec, attemptPushAggSpec]) {
    await db.execute(sql.raw(spec.createDdl));
    await db.execute(sql.raw(spec.functionDdl));
    await db.execute(sql.raw(spec.triggerDdl));
    await db.execute(sql.raw(spec.reconcileDdl));
  }

  // Dependency order: attempts_v → task_blocking_v → tasks_v.
  for (const [name, view] of [
    ["attempts_v", attempts],
    ["conversations_v", conversations],
    ["task_blocking_v", taskBlocking],
    ["tasks_v", tasks],
  ] as const) {
    await db.execute(sql.raw(compileCreateView({ name, view, dependsOn: [] })));
  }
}

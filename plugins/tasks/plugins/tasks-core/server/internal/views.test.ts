/**
 * Real-DB semantics suite for the derived task views (`views.ts`) — specifically
 * the STATUS PRECEDENCE rules, which are pure SQL and were otherwise unguarded.
 *
 * The bug this pins down: "Hold & close" wrote `held_at`, closed the last live
 * conversation, which flipped the attempt `pushed` → `completed`, which made
 * `tasks_v` resolve the task to `done` — discarding the hold and emitting
 * taskStatusChanged{status:'done'}, the exact event `tasks.maybe-launch-dependents`
 * fans out on. The next task launched itself ~40s after the user held this one.
 *
 * Held now outranks a completed attempt in BOTH derived views, and the two must
 * stay in agreement (`task_blocking_v` re-derives "settled" from the raw columns
 * because it cannot read `tasks_v.status` without a cycle) — so both are asserted
 * here off one seeded graph.
 *
 * Headless: no server boot, no plugin registry. The view + rollup DDL is compiled
 * straight from the exported declarations, so the SQL under test is byte-identical
 * to what `rebuildDerivedViews` / `rebuildDerivedTables` install at boot.
 *
 * Run: `bun test plugins/tasks/plugins/tasks-core/server/internal/views.test.ts`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { compileCreateView } from "@plugins/database/plugins/derived-views/core";
import { attemptConvAggSpec, attemptPushAggSpec } from "./rollup-spec";
import { attempts, taskBlocking, tasks } from "./views";

let t: TestDb;

// Provisioning a throwaway DB and running the full migration chain overruns
// bun's 5s default, which surfaces as an unrelated "pool already ended" error.
setDefaultTimeout(120_000);

beforeAll(async () => {
  t = await createTestDb({ prefix: "tv_test" });
  // The real migration chain — the real base tables, FKs and cascades.
  await runMigrations(t.db);

  // The migration chain still contains the historical CREATE VIEW statements
  // from before plain views became derived code, so drop whatever it left
  // behind before installing the current definitions (CASCADE: tasks_v reads
  // attempts_v). Mirrors rebuildDerivedViews' drop-in-reverse-dependency-order.
  for (const name of ["tasks_v", "task_blocking_v", "conversations_v", "attempts_v"]) {
    await t.db.execute(sql.raw(`DROP VIEW IF EXISTS "public"."${name}" CASCADE`));
  }

  // attempts_v LEFT JOINs the two trigger-maintained rollups; without them the
  // view compiles but every attempt reads as 'pending'.
  for (const spec of [attemptConvAggSpec, attemptPushAggSpec]) {
    await t.db.execute(sql.raw(spec.createDdl));
    await t.db.execute(sql.raw(spec.functionDdl));
    await t.db.execute(sql.raw(spec.triggerDdl));
    await t.db.execute(sql.raw(spec.reconcileDdl));
  }

  // Dependency order: attempts_v → task_blocking_v → tasks_v.
  for (const [name, view] of [
    ["attempts_v", attempts],
    ["task_blocking_v", taskBlocking],
    ["tasks_v", tasks],
  ] as const) {
    await t.db.execute(sql.raw(compileCreateView({ name, view, dependsOn: [] })));
  }
});

afterAll(async () => {
  await t.drop();
});

// ── seeding ──────────────────────────────────────────────────────────────────
// Raw INSERTs: the rank/status columns are branded value objects on the drizzle
// side, and this suite is about the SQL the views run, not the TS mapping.

let seq = 0;
const nextId = (kind: string): string => `${kind}-${++seq}`;

async function seedTask(opts: { held?: boolean; dropped?: boolean } = {}): Promise<string> {
  const id = nextId("task");
  await t.db.execute(sql`
    INSERT INTO tasks (id, title, rank, held_at, dropped_at)
    VALUES (${id}, ${`title ${id}`}, ${`a${seq}`},
            ${opts.held ? sql`now()` : sql`NULL`},
            ${opts.dropped ? sql`now()` : sql`NULL`})
  `);
  return id;
}

async function seedAttempt(taskId: string): Promise<string> {
  const id = nextId("att");
  await t.db.execute(sql`
    INSERT INTO attempts (id, task_id, worktree_path) VALUES (${id}, ${taskId}, ${`/tmp/${id}`})
  `);
  return id;
}

/** `status: 'done'` is a closed conversation; anything else counts as live. */
async function seedConversation(attemptId: string, status: string): Promise<string> {
  const id = nextId("conv");
  await t.db.execute(sql`
    INSERT INTO conversations (id, attempt_id, status, ended_at)
    VALUES (${id}, ${attemptId}, ${status},
            ${status === "done" ? sql`now()` : sql`NULL`})
  `);
  return id;
}

async function seedPush(attemptId: string): Promise<void> {
  const id = nextId("push");
  await t.db.execute(sql`
    INSERT INTO pushes (id, attempt_id, sha, push_id, message)
    VALUES (${id}, ${attemptId}, ${`sha-${id}`}, ${`pid-${id}`}, ${"msg"})
  `);
}

async function seedDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  await t.db.execute(sql`
    INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (${taskId}, ${dependsOnTaskId})
  `);
}

/** The exact shape of the reported bug: an attempt that pushed, then closed. */
async function seedPushedAndClosed(taskId: string): Promise<void> {
  const attemptId = await seedAttempt(taskId);
  await seedConversation(attemptId, "done");
  await seedPush(attemptId);
}

async function taskStatus(id: string): Promise<{ status: string; finishedAt: Date | null }> {
  const { rows } = await t.db.execute(
    sql`SELECT status, finished_at FROM tasks_v WHERE id = ${id}`,
  );
  const row = rows[0] as { status: string; finished_at: Date | null } | undefined;
  if (!row) throw new Error(`no tasks_v row for ${id}`);
  return { status: row.status, finishedAt: row.finished_at };
}

async function isBlocked(id: string): Promise<boolean> {
  const { rows } = await t.db.execute(
    sql`SELECT has_blocking_dep FROM task_blocking_v WHERE task_id = ${id}`,
  );
  const row = rows[0] as { has_blocking_dep: boolean } | undefined;
  // No row ⇒ no dependency edges ⇒ not blocked (consumers COALESCE the absence).
  return row?.has_blocking_dep ?? false;
}

// ── status precedence ────────────────────────────────────────────────────────

describe("tasks_v status — hold vs a completed attempt", () => {
  test("baseline: an attempt that pushed and closed makes the task done", async () => {
    const taskId = await seedTask();
    await seedPushedAndClosed(taskId);

    const { status, finishedAt } = await taskStatus(taskId);
    expect(status).toBe("done");
    expect(finishedAt).not.toBeNull();
  });

  test("held wins over that completed attempt (the Hold & close bug)", async () => {
    const taskId = await seedTask({ held: true });
    await seedPushedAndClosed(taskId);

    const { status, finishedAt } = await taskStatus(taskId);
    expect(status).toBe("held");
    // A held task is not finished — status and finished_at must not contradict.
    expect(finishedAt).toBeNull();
  });

  test("held with no attempt at all is still held", async () => {
    const taskId = await seedTask({ held: true });
    expect((await taskStatus(taskId)).status).toBe("held");
  });

  test("a live conversation still outranks the hold, mirroring dropped", async () => {
    const heldTask = await seedTask({ held: true });
    const heldAttempt = await seedAttempt(heldTask);
    await seedConversation(heldAttempt, "running");

    const droppedTask = await seedTask({ dropped: true });
    const droppedAttempt = await seedAttempt(droppedTask);
    await seedConversation(droppedAttempt, "running");

    expect((await taskStatus(heldTask)).status).toBe("in_progress");
    expect((await taskStatus(droppedTask)).status).toBe("in_progress");
  });

  test("dropped still loses to a completed attempt (unchanged)", async () => {
    const taskId = await seedTask({ dropped: true });
    await seedPushedAndClosed(taskId);

    expect((await taskStatus(taskId)).status).toBe("done");
  });
});

// ── blocking, which is what actually launched the next agent ─────────────────

describe("task_blocking_v — a held dependency keeps blocking", () => {
  test("baseline: a done dependency stops blocking its dependent", async () => {
    const dep = await seedTask();
    await seedPushedAndClosed(dep);
    const dependent = await seedTask();
    await seedDependency(dependent, dep);

    expect(await isBlocked(dependent)).toBe(false);
  });

  test("holding that same dependency re-blocks the dependent", async () => {
    const dep = await seedTask({ held: true });
    await seedPushedAndClosed(dep);
    const dependent = await seedTask();
    await seedDependency(dependent, dep);

    expect(await isBlocked(dependent)).toBe(true);
    // And the dependent reports it, so the UI agrees with the auto-start gate.
    expect((await taskStatus(dependent)).status).toBe("blocked");
  });

  test("a dropped dependency still stops blocking (unchanged)", async () => {
    const dep = await seedTask({ dropped: true });
    const dependent = await seedTask();
    await seedDependency(dependent, dep);

    expect(await isBlocked(dependent)).toBe(false);
  });

  test("blocking walks transitively through a held ancestor", async () => {
    const ancestor = await seedTask({ held: true });
    await seedPushedAndClosed(ancestor);
    const middle = await seedTask();
    await seedPushedAndClosed(middle);
    const dependent = await seedTask();
    await seedDependency(middle, ancestor);
    await seedDependency(dependent, middle);

    expect(await isBlocked(dependent)).toBe(true);
  });
});

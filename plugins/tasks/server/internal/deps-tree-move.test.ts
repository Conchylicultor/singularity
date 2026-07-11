import { describe, test, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { applyDepsTreeMove } from "./deps-tree-move";

// Real-DB suite for the dependency-tree move. `applyDepsTreeMove` reads the
// `tasks_v` view (status snapshot + cycle check), which only the real boot
// builds — a `db-test-fixture` throwaway (migrations only, no derived-view
// registry) cannot reproduce it. So we drive the REAL SQL against the running
// worktree DB, but every scenario runs inside ONE transaction we deliberately
// roll back (the `Rollback` sentinel): nothing is ever committed, so the suite
// is isolated with no seeded rows or emitted events left behind. Seeded tasks
// are `dropped`, whose status is edge-independent, so no `tasks.statusChanged`
// ever fires during a move.
//
// Requires the running embedded cluster with this worktree's DB built
// (`./singularity build` first):
//   bun test plugins/tasks/server/internal/deps-tree-move.test.ts

const P = "dmt-"; // id prefix — isolates our reads from real tasks in the DB

class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedTasks(tx: Tx, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    // `dropped` (dropped_at set) ⇒ status is 'dropped' regardless of deps, so a
    // move never changes any task's status and never emits an event.
    await tx.execute(sql`
      INSERT INTO tasks (id, title, title_auto, expanded, rank, dropped_at, created_at, updated_at)
      VALUES (${ids[i]}, ${ids[i]}, true, false, ${"a" + i}, now(), now(), now())
    `);
  }
}

// edge A→B = "A depends on B".
async function seedEdge(tx: Tx, a: string, b: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at)
    VALUES (${a}, ${b}, now())
  `);
}

async function readEdges(tx: Tx): Promise<Set<string>> {
  const res = await tx.execute(
    sql`SELECT task_id, depends_on_task_id FROM task_dependencies WHERE task_id LIKE ${P + "%"}`,
  );
  return new Set(
    (res.rows as { task_id: string; depends_on_task_id: string }[]).map(
      (r) => `${r.task_id}->${r.depends_on_task_id}`,
    ),
  );
}

// Run one scenario in a rolled-back transaction; return the edge set as it stood
// just after the move (before rollback).
async function scenario(seed: (tx: Tx) => Promise<void>): Promise<Set<string>> {
  let edges: Set<string> | undefined;
  try {
    await db.transaction(async (tx) => {
      await seed(tx);
      edges = await readEdges(tx);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return edges!;
}

describe("applyDepsTreeMove", () => {
  test("splice reorders a chain: 0←1←2←3, move 1 onto 2 ⇒ 0←2←1←3", async () => {
    const [t0, t1, t2, t3] = [P + "0", P + "1", P + "2", P + "3"];
    const edges = await scenario(async (tx) => {
      await seedTasks(tx, [t0, t1, t2, t3]);
      await seedEdge(tx, t1, t0);
      await seedEdge(tx, t2, t1);
      await seedEdge(tx, t3, t2);
      await applyDepsTreeMove({ taskId: t1, newParentId: t2, mode: "splice" }, tx);
    });

    expect(edges).toEqual(new Set([`${t2}->${t0}`, `${t1}->${t2}`, `${t3}->${t1}`]));
  });

  test("branch attaches a parallel child without disturbing the parent's other children", async () => {
    const [y, c, x] = [P + "y", P + "c", P + "x"];
    const edges = await scenario(async (tx) => {
      await seedTasks(tx, [y, c, x]);
      await seedEdge(tx, c, y); // c already depends on y
      await applyDepsTreeMove({ taskId: x, newParentId: y, mode: "branch" }, tx);
    });

    // Both c and x depend on y (parallel); nothing rewired onto x.
    expect(edges).toEqual(new Set([`${c}->${y}`, `${x}->${y}`]));
  });

  test("splice rewires the new parent's existing child onto the moved task", async () => {
    const [y, c, x] = [P + "py", P + "pc", P + "px"];
    const edges = await scenario(async (tx) => {
      await seedTasks(tx, [y, c, x]);
      await seedEdge(tx, c, y); // c depends on y
      await applyDepsTreeMove({ taskId: x, newParentId: y, mode: "splice" }, tx);
    });

    // x inserts under y; y's old child c now depends on x instead: y←x←c.
    expect(edges).toEqual(new Set([`${x}->${y}`, `${c}->${x}`]));
  });

  test("branch-to-root heals: ex-children bridge to the ex-parent, moved task becomes a root", async () => {
    const [t0, t1, t2, t3] = [P + "0", P + "1", P + "2", P + "3"];
    const edges = await scenario(async (tx) => {
      await seedTasks(tx, [t0, t1, t2, t3]);
      await seedEdge(tx, t1, t0);
      await seedEdge(tx, t2, t1);
      await seedEdge(tx, t3, t2);
      await applyDepsTreeMove({ taskId: t1, newParentId: null, mode: "splice" }, tx);
    });

    // 1's child (2) bridges to 1's parent (0); 1 is detached (root, no edges).
    expect(edges).toEqual(new Set([`${t2}->${t0}`, `${t3}->${t2}`]));
  });

  test("fan-in heal is a cross-product: the child bridges to EVERY old parent", async () => {
    const [a, b, x, c] = [P + "a", P + "b", P + "x", P + "c"];
    const edges = await scenario(async (tx) => {
      await seedTasks(tx, [a, b, x, c]);
      await seedEdge(tx, x, a); // x depends on a
      await seedEdge(tx, x, b); // x depends on b
      await seedEdge(tx, c, x); // c depends on x
      await applyDepsTreeMove({ taskId: x, newParentId: null, mode: "branch" }, tx);
    });

    // c bridges to both a and b; x is detached.
    expect(edges).toEqual(new Set([`${c}->${a}`, `${c}->${b}`]));
  });
});

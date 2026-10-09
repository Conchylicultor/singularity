/**
 * Real-DB suite for held turns (held-turns.ts): the accept's row lock against
 * the status flip, and the two delivery paths' order, claim and serialization.
 * Every guarantee here lives in Postgres locks, so a fake `db` would prove
 * nothing. Drives the db-parametrized functions against a throwaway database
 * (db-test-fixture) seeded with the REAL migration chain.
 *
 * Requires the running embedded cluster — `./singularity build` first.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  setDefaultTimeout,
} from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import { runMigrations } from "@plugins/database/plugins/migrations/server/testing";
import { FALLBACK_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import {
  acceptTurn,
  deliverHeldTurns,
  hasHeldTurns,
  launchWithHeldTurn,
  listHeldTurns,
  mergeLaunchPrompt,
} from "./held-turns";

let t: TestDb;
// `createTestDb`'s own pool holds ONE connection. The code under test holds a
// transaction (the row lock, the delivery lock) while it writes through a
// second connection, and the race cases need two transactions that genuinely
// block on each other — so everything runs on a pool of its own.
let pool: Pool;
let conn: NodePgDatabase;

setDefaultTimeout(120_000);

beforeAll(async () => {
  t = await createTestDb({ prefix: "held_turns_test" });
  await runMigrations(t.db);
  pool = new Pool({ connectionString: t.connectionString, max: 6 });
  conn = drizzle(pool);
});

afterAll(async () => {
  await pool.end();
  await t.drop();
});

let seq = 0;
const nextId = (kind: string): string => `${kind}-${++seq}-${Date.now()}`;

async function seedConversation(status: string): Promise<string> {
  const taskId = nextId("task");
  const attemptId = nextId("att");
  const conversationId = nextId("conv");
  await t.db.execute(sql`
    INSERT INTO tasks (id, title, rank) VALUES (${taskId}, ${`title ${taskId}`}, ${`a${seq}`})
  `);
  await t.db.execute(sql`
    INSERT INTO attempts (id, task_id, worktree_path)
    VALUES (${attemptId}, ${taskId}, ${`/tmp/${attemptId}`})
  `);
  await t.db.execute(sql`
    INSERT INTO conversations (id, attempt_id, status, runtime, model, spawned_by)
    VALUES (${conversationId}, ${attemptId}, ${status}, 'tmux', ${FALLBACK_MODEL}, 'test')
  `);
  return conversationId;
}

const turn = (text: string) => ({ text, rawText: `raw ${text}` });

const heldTexts = async (conversationId: string): Promise<string[]> =>
  (await listHeldTurns(conversationId, conn)).map((h) => h.text);

/** Resolves once some backend is waiting on a lock it has not been granted. */
async function untilSomeoneWaitsOnALock(): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const res = await t.db.execute<{ n: number }>(
      // Cluster-wide view: count only this throwaway database's sessions. (A
      // row-lock waiter waits on the holder's transactionid lock, which
      // pg_locks lists with no database — hence pg_stat_activity.)
      sql`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((res.rows[0]?.n ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error("nobody ever waited on a lock");
    await Bun.sleep(20);
  }
}

/**
 * The error `p` rejected with; throws if it resolved. `expect(p).rejects` is
 * typed `void` under bun:test, so it cannot be awaited under `await-thenable`.
 */
async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

/** A promise plus the hand that settles it. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

describe("acceptTurn", () => {
  test("a conversation still starting holds the turn", async () => {
    const id = await seedConversation("starting");
    expect(await acceptTurn(id, turn("hello"), conn)).toEqual({ kind: "held" });
    expect(await heldTexts(id)).toEqual(["hello"]);
    expect((await listHeldTurns(id, conn))[0]!.rawText).toBe("raw hello");
  });

  test("a conversation past starting sends directly and holds nothing", async () => {
    const id = await seedConversation("waiting");
    expect(await acceptTurn(id, turn("hello"), conn)).toEqual({ kind: "send" });
    expect(await hasHeldTurns(id, conn)).toBe(false);
  });

  test("an unknown conversation is not-found", async () => {
    expect(await acceptTurn("conv-missing", turn("x"), conn)).toEqual({
      kind: "not-found",
    });
  });

  test("a flip in progress makes the accept wait, then send directly", async () => {
    // The reconciler's flip is an UPDATE of the row the accept locks. While it
    // is uncommitted the accept must not read `starting` and hold — the flush
    // the flip enqueues may already have looked, stranding the turn.
    const id = await seedConversation("starting");
    const flip = await pool.connect();
    try {
      await flip.query("BEGIN");
      await flip.query(
        "UPDATE conversations SET status = 'waiting' WHERE id = $1",
        [id],
      );
      let settled = false;
      const accepted = acceptTurn(id, turn("racing"), conn).then((r) => {
        settled = true;
        return r;
      });
      await untilSomeoneWaitsOnALock();
      expect(settled).toBe(false);
      await flip.query("COMMIT");
      expect(await accepted).toEqual({ kind: "send" });
    } finally {
      flip.release();
    }
    expect(await hasHeldTurns(id, conn)).toBe(false);
  });

  test("an accept in progress makes the flip wait, and the flush after it sees the turn", async () => {
    const id = await seedConversation("starting");
    // Hold the accept's row lock open by locking the row the same way first.
    const holder = await pool.connect();
    const flipper = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(
        "SELECT 1 FROM conversations WHERE id = $1 FOR UPDATE",
        [id],
      );
      await holder.query(
        "INSERT INTO conversation_held_turns (id, conversation_id, text, raw_text) VALUES ($1, $2, 'early', 'raw early')",
        [`held-${id}`, id],
      );
      let flipped = false;
      const flip = flipper
        .query("UPDATE conversations SET status = 'waiting' WHERE id = $1", [
          id,
        ])
        .then(() => {
          flipped = true;
        });
      await untilSomeoneWaitsOnALock();
      expect(flipped).toBe(false);
      await holder.query("COMMIT");
      await flip;
    } finally {
      holder.release();
      flipper.release();
    }
    // The flush the reconciler enqueues after its write.
    const sent: string[] = [];
    await deliverHeldTurns(
      id,
      async (text) => {
        sent.push(text);
      },
      conn,
    );
    expect(sent).toEqual(["early"]);
    expect(await hasHeldTurns(id, conn)).toBe(false);
  });
});

describe("deliverHeldTurns (path B)", () => {
  test("sends every held turn in the order accepted, deleting each", async () => {
    const id = await seedConversation("starting");
    for (const text of ["one", "two", "three"]) {
      await acceptTurn(id, turn(text), conn);
    }
    const sent: string[] = [];
    const delivered = await deliverHeldTurns(
      id,
      async (text) => {
        sent.push(text);
      },
      conn,
    );
    expect(sent).toEqual(["one", "two", "three"]);
    expect(delivered.map((d) => d.rawText)).toEqual([
      "raw one",
      "raw two",
      "raw three",
    ]);
    expect(await hasHeldTurns(id, conn)).toBe(false);
  });

  test("a failed send keeps it and every later turn held, in order", async () => {
    const id = await seedConversation("starting");
    for (const text of ["one", "two", "three"]) {
      await acceptTurn(id, turn(text), conn);
    }
    const boom = new Error("tmux send-keys failed");
    expect(
      await rejection(
        deliverHeldTurns(
          id,
          async (text) => {
            if (text === "two") throw boom;
          },
          conn,
        ),
      ),
    ).toBe(boom);
    expect(await heldTexts(id)).toEqual(["two", "three"]);
  });

  test("touches only its own conversation", async () => {
    const a = await seedConversation("starting");
    const b = await seedConversation("starting");
    await acceptTurn(a, turn("for a"), conn);
    await acceptTurn(b, turn("for b"), conn);
    await deliverHeldTurns(a, async () => {}, conn);
    expect(await heldTexts(b)).toEqual(["for b"]);
  });
});

describe("launchWithHeldTurn (path A)", () => {
  test("mergeLaunchPrompt keeps the launch prompt (and its preprompt) first", () => {
    expect(
      mergeLaunchPrompt("<special_instructions>x</special_instructions>", "hi"),
    ).toBe("<special_instructions>x</special_instructions>\n\nhi");
    expect(mergeLaunchPrompt(undefined, "hi")).toBe("hi");
    expect(mergeLaunchPrompt("", "hi")).toBe("hi");
  });

  test("the oldest held turn rides the launch prompt and only its row is deleted", async () => {
    const id = await seedConversation("starting");
    await acceptTurn(id, turn("first"), conn);
    await acceptTurn(id, turn("second"), conn);
    const prompts: (string | undefined)[] = [];
    const delivered = await launchWithHeldTurn(
      id,
      "<special_instructions>be terse</special_instructions>",
      async (prompt) => {
        prompts.push(prompt);
      },
      conn,
    );
    expect(prompts).toEqual([
      "<special_instructions>be terse</special_instructions>\n\nfirst",
    ]);
    expect(delivered?.rawText).toBe("raw first");
    // The second goes to path B, triggered by the flip after the launch.
    expect(await heldTexts(id)).toEqual(["second"]);
  });

  test("nothing held launches with the launch's own prompt", async () => {
    const id = await seedConversation("starting");
    const prompts: (string | undefined)[] = [];
    expect(
      await launchWithHeldTurn(
        id,
        undefined,
        async (p) => {
          prompts.push(p);
        },
        conn,
      ),
    ).toBeNull();
    expect(prompts).toEqual([undefined]);
  });

  test("a launch that throws keeps the turn held", async () => {
    const id = await seedConversation("starting");
    await acceptTurn(id, turn("first"), conn);
    const boom = new Error("tmux new-session failed");
    expect(
      await rejection(
        launchWithHeldTurn(
          id,
          undefined,
          async () => {
            throw boom;
          },
          conn,
        ),
      ),
    ).toBe(boom);
    expect(await heldTexts(id)).toEqual(["first"]);
  });

  test("a flush racing the launch waits for it and never re-sends the launch turn", async () => {
    const id = await seedConversation("starting");
    await acceptTurn(id, turn("first"), conn);
    await acceptTurn(id, turn("second"), conn);
    const launching = gate();
    const inLaunch = gate();
    const launch = launchWithHeldTurn(
      id,
      undefined,
      async () => {
        inLaunch.open();
        await launching.wait;
      },
      conn,
    );
    await inLaunch.wait;
    const sent: string[] = [];
    const flush = deliverHeldTurns(
      id,
      async (text) => {
        sent.push(text);
      },
      conn,
    );
    await untilSomeoneWaitsOnALock();
    expect(sent).toEqual([]);
    launching.open();
    await launch;
    await flush;
    expect(sent).toEqual(["second"]);
    expect(await hasHeldTurns(id, conn)).toBe(false);
  });
});

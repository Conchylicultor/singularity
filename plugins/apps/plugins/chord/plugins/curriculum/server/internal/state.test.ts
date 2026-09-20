/**
 * The ladder's rows against a real Postgres: what the standing reads back as,
 * what an unlock writes, and what an undo takes away.
 *
 * A throwaway database with the real schema, applied by the real migration
 * chain — so it needs the migration `./singularity build` generates from
 * `tables.ts`, and the running embedded cluster. `createTestDb` throws loudly
 * rather than skipping when the cluster is not up.
 *
 * Run: `./singularity test plugins/apps/plugins/chord/plugins/curriculum`
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { firstCurriculum, stageById, type NextStep } from "../../core";
import { appendStep, dropLastStep, loadCurriculum } from "./state";
import { _chordUnlocks } from "./tables";

const token = (text: string) => ChordTokenSchema.parse(text);
const vi = token("9:3-4/0");
const MINOR_SEED = stageById("minor-keys").seed;

const HALF: NextStep = { kind: "ask", rule: "half" };
const ALL: NextStep = { kind: "ask", rule: "all" };
const ADD_VI: NextStep = {
  kind: "chords",
  stage: "major-triads",
  tokens: [vi],
  modes: [],
};
const OPEN_MINOR: NextStep = {
  kind: "chords",
  stage: "minor-keys",
  tokens: [...MINOR_SEED],
  modes: ["minor"],
};

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "chord_curriculum_test" });
  await runMigrations(t.db);
});

afterAll(async () => {
  await t?.drop();
});

beforeEach(async () => {
  await t.db.execute(sql`TRUNCATE chord_unlocks`);
});

describe("loadCurriculum", () => {
  test("no rows: everyone starts at level 1", async () => {
    expect(await loadCurriculum(t.db)).toEqual(firstCurriculum());
  });

  test("a walk up the ladder, read back", async () => {
    for (const step of [HALF, ALL, ADD_VI, OPEN_MINOR]) {
      await appendStep(t.db, step);
    }
    const standing = await loadCurriculum(t.db);
    expect(standing.level).toBe(5);
    expect(standing.askRule).toBe("all");
    expect(standing.askRuleLevel).toBe(3);
    expect(standing.modes).toEqual(["major", "minor"]);
    expect(standing.stage).toBe("minor-keys");
    expect(standing.unlocked.map((u) => [u.token, u.level])).toEqual([
      [token("0:4-3/0"), 1],
      [token("5:4-3/0"), 1],
      [token("7:4-3/0"), 1],
      [vi, 4],
      ...MINOR_SEED.map((seed: ChordToken) => [seed, 5]),
    ]);
  });

  test("the step comes back as it was written, decoded", async () => {
    await appendStep(t.db, OPEN_MINOR);
    const rows = await t.db.select().from(_chordUnlocks);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.step).toEqual(OPEN_MINOR);
    expect(rows[0]?.position).toBe(2);
    expect(rows[0]?.unlockedAt).toBeInstanceOf(Date);
  });

  test("a gap in the levels throws rather than being read over", async () => {
    await appendStep(t.db, HALF);
    await t.db.insert(_chordUnlocks).values({ position: 7, step: ALL });
    expect((await rejection(loadCurriculum(t.db))).message).toMatch(
      /ladder has a gap/,
    );
  });
});

describe("appendStep", () => {
  test("levels run 2, 3, 4…", async () => {
    expect(await appendStep(t.db, HALF)).toBe(2);
    expect(await appendStep(t.db, ALL)).toBe(3);
    expect(await appendStep(t.db, ADD_VI)).toBe(4);
  });

  test("a step the schema refuses never reaches the table", async () => {
    const empty = {
      kind: "chords",
      stage: "colour",
      tokens: [],
      modes: [],
    } as unknown as NextStep;
    await rejection(appendStep(t.db, empty));
    expect(await t.db.select().from(_chordUnlocks)).toEqual([]);
  });
});

describe("dropLastStep", () => {
  test("takes the last step away and says where that leaves the learner", async () => {
    await appendStep(t.db, HALF);
    await appendStep(t.db, ADD_VI);
    expect(await dropLastStep(t.db)).toEqual({
      kind: "undone",
      level: 2,
      step: ADD_VI,
    });
    const standing = await loadCurriculum(t.db);
    expect(standing.level).toBe(2);
    expect(standing.unlocked.map((u) => u.token)).not.toContain(vi);
    expect(await dropLastStep(t.db)).toEqual({
      kind: "undone",
      level: 1,
      step: HALF,
    });
    expect(await loadCurriculum(t.db)).toEqual(firstCurriculum());
  });

  test("at level 1 there is nothing to undo", async () => {
    expect(await dropLastStep(t.db)).toEqual({ kind: "nothing-to-undo" });
  });

  test("the level freed is taken again by the next step", async () => {
    await appendStep(t.db, HALF);
    await appendStep(t.db, ADD_VI);
    await dropLastStep(t.db);
    expect(await appendStep(t.db, ALL)).toBe(3);
  });
});

/**
 * Await `p` and return the Error it rejected with; throw if it resolved
 * instead. `expect(p).rejects.toThrow()` is typed `void` under bun:test, so
 * awaiting it is flagged by await-thenable.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

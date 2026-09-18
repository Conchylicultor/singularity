/**
 * The two loop reads, and the skip summary's shape, against a real Postgres.
 *
 * What only a database can show: that `next-chords` and `find` agree — every
 * window `next-chords` credits a chord with is a window `find` returns once
 * that chord is unlocked — and that a jsonb column keeps a list's order while
 * it re-orders an object's keys.
 *
 * The agreement is over the windows (`findLoopsWhere`). `find` also leaves out
 * videos known to be unplayable (`playableVideoWhere`), which the count
 * deliberately does not — see `nextChordsQuery` — so that part is not compared.
 *
 * Requires the running embedded cluster (`./singularity build` first);
 * `createTestDb` throws loudly rather than skipping when it is not up.
 *
 * Run: `./singularity test plugins/apps/plugins/chord`
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import {
  FindLoopsBodySchema,
  NextChordsBodySchema,
  NextChordCountSchema,
  SkipSummarySchema,
  SkipTally,
  chordTokenFromParts,
  type ChordToken,
} from "../../core";
import { findLoopsWhere, nextChordsQuery } from "./find";
import { _chordLoopWindows } from "./tables";

let t: TestDb;

const major = (root: number): ChordToken =>
  chordTokenFromParts({ root, intervals: [4, 3], inversion: 0 });
const minor = (root: number): ChordToken =>
  chordTokenFromParts({ root, intervals: [3, 4], inversion: 0 });
const I = major(0);
const IV = major(5);
const V = major(7);
const vi = minor(9);
const ii = minor(2);

/** A window of `tokens` in its own section, so each row stands alone. */
function window(sectionId: string, tokens: ChordToken[]) {
  return {
    sectionId,
    shape: "bars-4" as const,
    startBeat: 1,
    endBeat: 17,
    bars: 4,
    beatsPerBar: 4,
    beatUnit: 4,
    keyTonic: "C",
    keyMode: "major" as const,
    chordTokens: tokens,
    features: [],
    chordCount: tokens.length,
    changeCount: tokens.length - 1,
    hasRest: false,
    startsOnChange: true,
  };
}

beforeAll(async () => {
  t = await createTestDb({ prefix: "chord_loops_test" });
  // The windows table alone: these reads never join the sections, and the
  // throwaway database runs no migrations. The columns mirror `tables.ts` — a
  // read that grew a column it does not declare fails here, loudly.
  await t.db.execute(sql`
    CREATE TABLE chord_loop_windows (
      section_id text NOT NULL,
      shape text NOT NULL,
      start_beat double precision NOT NULL,
      end_beat double precision NOT NULL,
      bars integer NOT NULL,
      beats_per_bar double precision NOT NULL,
      beat_unit double precision NOT NULL,
      key_tonic text NOT NULL,
      key_mode text NOT NULL,
      chord_tokens text[] NOT NULL,
      features text[] NOT NULL,
      chord_count integer NOT NULL,
      change_count integer NOT NULL,
      has_rest boolean NOT NULL,
      starts_on_change boolean NOT NULL,
      PRIMARY KEY (section_id, shape, start_beat)
    )
  `);
  await t.db.insert(_chordLoopWindows).values([
    // A four-bar vamp on vi: nothing it plays is unlocked, and unlocking vi
    // alone makes it playable. The window the old count could not see.
    window("vamp-on-vi", [vi]),
    // The shape the old count did see: unlocked chords plus one outside.
    window("mixed", [I, IV, V, vi]),
    // Two chords short: unlocking either one alone changes nothing.
    window("two-foreign", [I, vi, ii]),
    // Already playable: it adds nothing to any chord's count.
    window("all-unlocked", [I, IV, V]),
  ]);
});

afterAll(async () => {
  await t?.drop();
});

async function nextChords(unlocked: ChordToken[]) {
  const body = NextChordsBodySchema.parse({ unlocked });
  const res = await t.db.execute(nextChordsQuery(body));
  return res.rows.map((row) => NextChordCountSchema.parse(row));
}

async function findSectionIds(unlocked: ChordToken[], target: ChordToken) {
  const body = FindLoopsBodySchema.parse({ unlocked, target, limit: 50 });
  const res = await t.db.execute<{ section_id: string }>(
    sql`SELECT section_id FROM ${_chordLoopWindows} WHERE ${findLoopsWhere(body)} ORDER BY 1`,
  );
  return res.rows.map((row) => row.section_id);
}

describe("countLoopsByNextChord's query", () => {
  test("counts a window that shares NO chord with the unlocked set", async () => {
    // The whole finding: a four-bar vamp on one chord outside the set has
    // exactly one distinct foreign chord, so unlocking that chord adds it.
    // Prefiltering on `chord_tokens && unlocked` dropped it.
    expect(await nextChords([I, IV, V])).toEqual([{ token: vi, windows: 2 }]);
  });

  test("ignores a window two chords short, and one already playable", async () => {
    // `ii` appears only in the two-foreign window, so nothing credits it.
    const counted = await nextChords([I, IV, V]);
    expect(counted.map((c) => c.token)).not.toContain(ii);
    // Unlock `ii` as well and the same window now needs only `vi`.
    expect(await nextChords([I, V, ii])).toEqual([
      { token: vi, windows: 2 },
      { token: IV, windows: 1 },
    ]);
  });

  test("every counted window is one find returns once that chord is unlocked", async () => {
    // The contract the count promises, checked against the other read: the two
    // windows credited to `vi` are exactly the ones find hands back.
    const [credited] = await nextChords([I, IV, V]);
    expect(credited).toEqual({ token: vi, windows: 2 });
    const found = await findSectionIds([I, IV, V, vi], vi);
    expect(found).toEqual(["mixed", "vamp-on-vi"]);
  });
});

describe("the skip summary in a jsonb column", () => {
  test("keeps its order as a list, where an object's keys are re-sorted", async () => {
    // Names of one length, the common one LAST alphabetically: ranked by count
    // the order is zzz, aaa — the opposite of the order jsonb gives an object.
    const tally = new SkipTally();
    tally.add("aaa", "a", "one");
    for (let i = 0; i < 3; i++) tally.add("zzz", `b${i}`, "many");
    const summary = tally.summary();
    expect(summary.map((entry) => entry.reason)).toEqual(["zzz", "aaa"]);

    const stored = await t.db.execute<{
      skipped: unknown;
      object: unknown;
    }>(sql`
      SELECT ${JSON.stringify(summary)}::jsonb AS skipped,
             ${JSON.stringify({ zzz: 3, aaa: 1 })}::jsonb AS object
    `);
    const row = stored.rows[0];
    if (row === undefined) throw new Error("no row");

    // The list comes back ranked, largest first — what `summary()` promises.
    expect(SkipSummarySchema.parse(row.skipped)).toEqual(summary);
    // And why it cannot be an object: jsonb stores an object's keys in its own
    // order (by length, then bytewise), so the ranking would come back wrong.
    expect(Object.keys(row.object as Record<string, number>)).toEqual([
      "aaa",
      "zzz",
    ]);
  });
});

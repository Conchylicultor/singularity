import {
  and,
  arrayContained,
  arrayContains,
  arrayOverlaps,
  eq,
  inArray,
  not,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import {
  LoopWindowFieldsSchema,
  NextChordCountSchema,
  chordOverlapsWindow,
  expandChord,
  type FindLoopsBody,
  type LoopCandidate,
  type NextChordCount,
  type NextChordsBody,
  type StoredChord,
  type TokenizedChord,
} from "../../core";
import { _chordLoopWindows, _chordSections } from "./tables";

// ── The two reads over the loop windows ──────────────────────────────────────
//
// Both take the unlocked set as an array parameter and let the GIN index on
// `chord_tokens` do the selective part. Neither checks readiness: the handlers
// answer `not-ready` before calling them.

const w = _chordLoopWindows;
const s = _chordSections;

/** The WHERE of `findLoopWindows`, built apart so its SQL can be checked without a database. */
export function findLoopsWhere(body: FindLoopsBody): SQL {
  const conditions: SQL[] = [
    eq(w.shape, body.shape),
    // Selective: the windows holding the target, straight off the GIN index.
    arrayContains(w.chordTokens, [body.target]),
    // Every chord of the window is unlocked.
    arrayContained(w.chordTokens, body.unlocked),
  ];
  if (body.modes) conditions.push(inArray(w.keyMode, body.modes));
  if (body.requireFeatures)
    conditions.push(arrayContains(w.features, body.requireFeatures));
  if (body.forbidFeatures)
    conditions.push(not(arrayOverlaps(w.features, body.forbidFeatures)));
  if (body.excludeSectionIds)
    conditions.push(notInArray(w.sectionId, body.excludeSectionIds));
  const where = and(...conditions);
  if (where === undefined)
    throw new Error("unreachable: findLoopsWhere always has conditions");
  return where;
}

/**
 * The section's chords the window sounds, in beat order.
 *
 * The overlap rule is `chordOverlapsWindow`, the same call the window's
 * `chordTokens` and `chordCount` were derived from: a chord returned here is
 * one the window counted, so the payload can never carry a token outside the
 * window's `chord_tokens` — the array the "every chord is unlocked" filter runs
 * against.
 */
export function chordsInWindow(
  chords: readonly StoredChord[],
  window: { startBeat: number; endBeat: number },
): TokenizedChord[] {
  return chords
    .filter((c) => chordOverlapsWindow(c, window.startBeat, window.endBeat))
    .sort((a, b) => a.beat - b.beat)
    .map(expandChord);
}

/** Random windows whose chords are all unlocked and include the target, with what the trainer needs to play them. */
export async function findLoopWindows(
  body: FindLoopsBody,
): Promise<LoopCandidate[]> {
  const rows = await db
    // Named columns, not the two whole rows: a section also carries `keys`,
    // `meters` and `tempos`, three jsonb columns a candidate never shows, and
    // selecting the row would decode all three per row for nothing.
    .select({
      sectionId: s.id,
      artist: s.artist,
      song: s.song,
      sectionName: s.sectionName,
      videoId: s.videoId,
      videoDurationSeconds: s.videoDurationSeconds,
      alignment: s.alignment,
      chords: s.chords,
      window: {
        shape: w.shape,
        startBeat: w.startBeat,
        endBeat: w.endBeat,
        bars: w.bars,
        beatsPerBar: w.beatsPerBar,
        beatUnit: w.beatUnit,
        keyTonic: w.keyTonic,
        keyMode: w.keyMode,
        chordTokens: w.chordTokens,
        features: w.features,
        chordCount: w.chordCount,
        changeCount: w.changeCount,
        hasRest: w.hasRest,
        startsOnChange: w.startsOnChange,
      },
    })
    .from(w)
    .innerJoin(s, eq(s.id, w.sectionId))
    .where(findLoopsWhere(body))
    // A random pick of the matching windows, sorted after the GIN index has cut
    // them down — never a sort of the table. Measured 2026-09-17 on the full
    // index (183,270 windows), 100 random unlocked sets over HTTP: p95 31 ms,
    // inside the < 50 ms target, so the sort stays.
    .orderBy(sql`random()`)
    .limit(body.limit);

  return rows.map(({ window, chords, ...section }) => {
    if (section.videoId === null) {
      throw new Error(
        `section ${section.sectionId} has loop windows but no video — a load wrote windows for an unloopable section`,
      );
    }
    return {
      ...section,
      videoId: section.videoId,
      // The token and feature arrays are plain `text[]` columns: parsed here into
      // their branded and enumerated types rather than asserted.
      window: LoopWindowFieldsSchema.parse(window),
      chords: chordsInWindow(chords, window),
    };
  });
}

/**
 * The query behind `countLoopsByNextChord`: for every window of the shape (and
 * modes), its distinct chords outside the unlocked set; a window with exactly
 * one counts for that chord.
 *
 * **Every window of the shape, with no overlap prefilter.** A window that
 * shares nothing with the unlocked set still counts when it has one distinct
 * token — a four-bar vamp on a single chord — and unlocking that chord really
 * does make `findLoopsWhere` return it, which is what this count promises.
 * Filtering on `chord_tokens && unlocked` first (the GIN index's selective
 * shape) dropped exactly those windows, and there are many: on the full index,
 * a learner who knows only I was told IV adds 2,121 windows (really 2,313) and
 * was never shown the minor tonic at all, though a vamp on it adds 1,542.
 *
 * So this scans the windows of the shape, and that is what it costs: measured
 * on the full index (183,270 windows), median of 6 runs, 87 ms for one unlocked
 * chord and 119 ms for eight — against 36 ms and 101 ms for the prefiltered
 * query that answered wrongly. The per-row work is one array subtraction over
 * the ≤ 4 distinct tokens of a 4-bar window. Adding `NOT (chord_tokens <@
 * unlocked)` to skip the windows that are already playable was measured too,
 * and is slower (94 / 125 ms): the test costs more than the rows it saves.
 */
export function nextChordsQuery(body: NextChordsBody): SQL {
  const unlocked = sql`${sql.param(body.unlocked)}::text[]`;
  const modes = body.modes ? sql`AND ${inArray(w.keyMode, body.modes)}` : sql``;
  return sql`
    SELECT foreign_tokens[1] AS token, count(*)::int AS windows
    FROM (
      SELECT array(
        SELECT t FROM unnest(${w.chordTokens}) AS t WHERE NOT (t = ANY(${unlocked}))
      ) AS foreign_tokens
      FROM ${w}
      WHERE ${w.shape} = ${body.shape}
        ${modes}
    ) AS candidates
    WHERE cardinality(foreign_tokens) = 1
    GROUP BY 1
    ORDER BY 2 DESC, 1
    LIMIT ${body.limit}
  `;
}

/** The chords worth unlocking next, by how many windows each would add. */
export async function countLoopsByNextChord(
  body: NextChordsBody,
): Promise<NextChordCount[]> {
  return executeRows(db, {
    query: nextChordsQuery(body),
    row: NextChordCountSchema,
  });
}

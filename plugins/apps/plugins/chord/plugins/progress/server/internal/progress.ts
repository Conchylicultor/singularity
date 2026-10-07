import { z } from "zod";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  executeOne,
  executeRows,
} from "@plugins/database/plugins/sql-rows/core";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { startOfLocalDay } from "@plugins/packages/plugins/wall-clock/core";
import {
  MASTERY_WINDOW,
  chordMastery,
  decodeProgressParams,
  type ChordAnswerSample,
  type ChordProgress,
  type ChordProgressParams,
} from "../../core";

const RecentAnswerRowSchema = z.object({
  token: ChordTokenSchema,
  correct: z.boolean(),
  answerMs: z.number().int(),
});

/**
 * Each token's last `MASTERY_WINDOW` answers, most recent first: one index scan
 * of `(token, answered_at desc, position desc)` per token, `LIMIT` inside the
 * lateral so no token reads more than the window.
 */
async function recentAnswers(
  db: NodePgDatabase,
  tokens: readonly ChordToken[],
): Promise<Map<ChordToken, ChordAnswerSample[]>> {
  const byToken = new Map<ChordToken, ChordAnswerSample[]>(
    tokens.map((t) => [t, []]),
  );
  if (tokens.length === 0) return byToken;
  const rows = await executeRows(db, {
    label: "chord.progress recent answers",
    query: sql`
      SELECT t.token, a.correct, a.answer_ms AS "answerMs"
      FROM unnest(${sql.param(tokens)}::text[]) WITH ORDINALITY AS t(token, ord)
      CROSS JOIN LATERAL (
        SELECT correct, answer_ms, answered_at, position
        FROM "chord_answers"
        WHERE chord_answers.token = t.token
        ORDER BY answered_at DESC, position DESC
        LIMIT ${MASTERY_WINDOW}
      ) a
      ORDER BY t.ord, a.answered_at DESC, a.position DESC
    `,
    row: RecentAnswerRowSchema,
  });
  for (const row of rows) {
    const list = byToken.get(row.token);
    if (list === undefined) {
      throw new Error(
        `chord.progress: the database answered for token ${row.token}, which was not asked for`,
      );
    }
    list.push({ correct: row.correct, answerMs: row.answerMs });
  }
  return byToken;
}

const PooledAnswerRowSchema = z.object({
  correct: z.boolean(),
  answerMs: z.number().int(),
});

/**
 * The last `MASTERY_WINDOW` answers given for any chord NOT in `listed`, taken
 * together, most recent first: the pooled standing of the chords the Rare
 * joker answers.
 *
 * Walks `chord_answers_answered_at_idx` backwards, skipping listed chords,
 * until it has the window — so it reads every answer newer than the 20th rare
 * one. That grows with the history only while rare answers are scarce, and is
 * one learner's history: small. The listed set is one array param.
 */
async function pooledUnlistedAnswers(
  db: NodePgDatabase,
  listed: ReadonlySet<ChordToken>,
): Promise<ChordAnswerSample[]> {
  return executeRows(db, {
    label: "chord.progress pooled rare answers",
    query: sql`
      SELECT correct, answer_ms AS "answerMs"
      FROM "chord_answers"
      WHERE NOT (token = ANY(${sql.param([...listed])}::text[]))
      ORDER BY answered_at DESC, position DESC
      LIMIT ${MASTERY_WINDOW}
    `,
    row: PooledAnswerRowSchema,
  });
}

const TotalsRowSchema = z.object({
  todaySongs: z.number().int(),
  todayAnswers: z.number().int(),
  todayCorrect: z.number().int(),
  todayTotalMs: z.number(),
  allSongs: z.number().int(),
  allAnswers: z.number().int(),
  allCorrect: z.number().int(),
});

/**
 * Today (a range scan on each table's time index) and all time (two counts,
 * which grow with the history — small at one learner's scale).
 */
async function totals(db: NodePgDatabase, since: Date) {
  return executeOne(db, {
    label: "chord.progress totals",
    query: sql`
      SELECT
        (SELECT count(*)::int FROM "chord_rounds" WHERE checked_at >= ${since}) AS "todaySongs",
        today.answers AS "todayAnswers",
        today.correct AS "todayCorrect",
        today.total_ms AS "todayTotalMs",
        (SELECT count(*)::int FROM "chord_rounds") AS "allSongs",
        everything.answers AS "allAnswers",
        everything.correct AS "allCorrect"
      FROM
        (SELECT count(*)::int AS answers,
                (count(*) FILTER (WHERE correct))::int AS correct,
                coalesce(sum(answer_ms), 0)::float8 AS total_ms
           FROM "chord_answers" WHERE answered_at >= ${since}) today,
        (SELECT count(*)::int AS answers,
                (count(*) FILTER (WHERE correct))::int AS correct
           FROM "chord_answers") everything
    `,
    row: TotalsRowSchema,
  });
}

/**
 * The `chord.progress` value for one (time zone, chord set). Throws on params
 * `decodeProgressParams` refuses (an unknown time zone, a malformed set).
 *
 * `listed` is the catalog's listed chords: every chord outside it is rare, and
 * pooled. Takes it, the database and the clock as parameters so a suite can
 * drive it on a throwaway at a chosen instant with a stub catalog.
 */
export async function loadChordProgress(
  db: NodePgDatabase,
  params: ChordProgressParams,
  listed: ReadonlySet<ChordToken>,
  now: Date = new Date(),
): Promise<ChordProgress> {
  const { timeZone, tokens } = decodeProgressParams(params);
  const since = startOfLocalDay(now, timeZone);
  const [recent, pooled, t] = await Promise.all([
    recentAnswers(db, tokens),
    pooledUnlistedAnswers(db, listed),
    totals(db, since),
  ]);
  return {
    chords: tokens.map((token) => {
      const answers = recent.get(token);
      if (answers === undefined) {
        throw new Error(`chord.progress: no answer list for token ${token}`);
      }
      return { token, ...chordMastery(answers) };
    }),
    rare: pooled.length === 0 ? null : chordMastery(pooled),
    today: {
      songs: t.todaySongs,
      answers: t.todayAnswers,
      correct: t.todayCorrect,
      totalMs: t.todayTotalMs,
    },
    allTime: {
      songs: t.allSongs,
      answers: t.allAnswers,
      correct: t.allCorrect,
    },
  };
}

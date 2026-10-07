import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { isRightAnswer, type RecordRoundBody } from "../../core";
import { _chordAnswers, _chordRounds } from "./tables";

/**
 * Save one checked round and its answers in one transaction. Whether each
 * answer is right is decided here (`isRightAnswer`: the chord itself, or the
 * Rare joker for a chord the catalog does not list); the counts on the round
 * are derived from the same decision. Every answer carries the round's check
 * time as its `answeredAt`.
 *
 * `isListed` is the catalog's word on a chord (`isListedChord`, curriculum),
 * asked only about the boxes answered Rare. Takes it and the database as
 * parameters so a suite can drive this on a throwaway.
 */
export async function recordRound(
  db: NodePgDatabase,
  body: RecordRoundBody,
  isListed: (token: ChordToken) => Promise<boolean>,
): Promise<{ roundId: string }> {
  const jokered = [
    ...new Set(
      body.answers.filter((a) => a.answer === "rare").map((a) => a.token),
    ),
  ];
  const listed = new Map(
    await Promise.all(
      jokered.map(async (token) => [token, await isListed(token)] as const),
    ),
  );
  const answers = body.answers.map((a) => ({
    ...a,
    correct: isRightAnswer(a.token, a.answer, (token) => {
      const known = listed.get(token);
      if (known === undefined) {
        throw new Error(
          `recordRound: ${token} was not looked up in the catalog`,
        );
      }
      return known;
    }),
  }));
  return db.transaction(async (tx) => {
    const [round] = await tx
      .insert(_chordRounds)
      .values({
        sectionId: body.sectionId,
        videoId: body.videoId,
        shape: body.shape,
        startBeat: body.startBeat,
        // The boxes the learner answered, not the boxes of the loop: the
        // scaffolded ones are `givenCount`.
        boxCount: answers.length,
        correctCount: answers.filter((a) => a.correct).length,
        givenCount: body.givenCount,
      })
      .returning({ id: _chordRounds.id, checkedAt: _chordRounds.checkedAt });
    if (round === undefined) {
      throw new Error("inserting a chord round returned no row");
    }
    await tx.insert(_chordAnswers).values(
      answers.map((a) => ({
        roundId: round.id,
        position: a.position,
        token: a.token,
        answer: a.answer,
        correct: a.correct,
        answerMs: a.answerMs,
        answeredAt: round.checkedAt,
        blanks: body.blanks,
      })),
    );
    return { roundId: round.id };
  });
}

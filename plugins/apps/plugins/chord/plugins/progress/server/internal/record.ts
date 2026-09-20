import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RecordRoundBody } from "../../core";
import { _chordAnswers, _chordRounds } from "./tables";

/**
 * Save one checked round and its answers in one transaction. Whether each
 * answer is right is decided here (`token === answer`); the counts on the
 * round are derived from the same decision. Every answer carries the round's
 * check time as its `answeredAt`.
 *
 * Takes the database as a parameter so a suite can drive it on a throwaway.
 */
export async function recordRound(
  db: NodePgDatabase,
  body: RecordRoundBody,
): Promise<{ roundId: string }> {
  const answers = body.answers.map((a) => ({
    ...a,
    correct: a.token === a.answer,
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
      })),
    );
    return { roundId: round.id };
  });
}

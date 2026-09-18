import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { TheorytabSectionIdSchema } from "@plugins/integrations/plugins/hooktheory/core";
import {
  ChordTokenSchema,
  LOOP_SHAPE_IDS,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── Saving a checked round ───────────────────────────────────────────────────

/**
 * The bounds of one answer's time. The trainer clamps to them (a box's clock
 * starts when its chord first finishes sounding, so a very fast click reads as
 * 0 and a wandered-off learner as minutes); the server refuses anything outside.
 */
export const MIN_ANSWER_MS = 300;
export const MAX_ANSWER_MS = 30_000;

/** One filled box: the chord that played, the one picked, and how long it took. */
export const RoundAnswerSchema = z.object({
  /** The box's place in the round, 0-based, in playing order. */
  position: z.number().int().min(0),
  /** The chord that played. */
  token: ChordTokenSchema,
  /** The chord the learner picked. */
  answer: ChordTokenSchema,
  answerMs: z.number().int().min(MIN_ANSWER_MS).max(MAX_ANSWER_MS),
});
export type RoundAnswer = z.infer<typeof RoundAnswerSchema>;

export const RecordRoundBodySchema = z.object({
  sectionId: TheorytabSectionIdSchema,
  videoId: z.string().min(1),
  shape: z.enum(LOOP_SHAPE_IDS),
  /** The loop's first beat (Hookpad's, 1-based), which with `sectionId` and `shape` names the loop. */
  startBeat: z.number(),
  /** Every box of the round, one each: positions are exactly 0…n-1. */
  answers: z
    .array(RoundAnswerSchema)
    .min(1)
    .refine(
      (answers) =>
        answers
          .map((a) => a.position)
          .sort((a, b) => a - b)
          .every((position, i) => position === i),
      {
        message:
          "answer positions must be exactly 0…n-1, one answer per box of the round",
      },
    ),
});
export type RecordRoundBody = z.infer<typeof RecordRoundBodySchema>;

/**
 * Save a checked round and its answers, in one transaction. Whether each answer
 * is right is decided here (`token === answer`), never taken from the client.
 * A round skipped before it was checked is never sent.
 */
export const recordRoundEndpoint = defineEndpoint({
  route: "POST /api/chord/rounds",
  body: RecordRoundBodySchema,
  response: z.object({ roundId: z.string() }),
});

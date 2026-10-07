import { z } from "zod";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── What a learner can answer, and when it is right ──────────────────────────
//
// Its own module, with nothing but zod and the token: `tables.ts` (a load-order
// leaf drizzle-kit loads on its own) types the `answer` column with it.

/**
 * What the learner picked for a box: a chord, or the Rare joker — the one
 * button that answers every chord the catalog does not list.
 */
export const AnswerSchema = z.union([ChordTokenSchema, z.literal("rare")]);
export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Whether `answer` names the chord that played: the chord itself, or the Rare
 * joker for a chord no track lists (`listed` is the catalog's word on that).
 * The server decides with it; the trainer shows its score with the same rule.
 */
export function isRightAnswer(
  token: ChordToken,
  answer: Answer,
  listed: (token: ChordToken) => boolean,
): boolean {
  return answer === "rare" ? !listed(token) : answer === token;
}

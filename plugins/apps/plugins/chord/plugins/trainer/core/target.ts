import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { ChordStanding } from "@plugins/apps/plugins/chord/plugins/progress/core";

// ── Which chord to practise next ─────────────────────────────────────────────

/**
 * The weakest unlocked chord: the `target` of the next loop query, so every
 * loop the trainer asks for holds it (plan "How a round works", step 1).
 *
 * Not mastered first, then the fewest recent answers, then the lowest
 * accuracy. A chord with no standing (never answered) counts as no answers.
 * Ties keep the order of `unlocked`.
 */
export function weakestChord(
  unlocked: readonly ChordToken[],
  standings: readonly ChordStanding[],
): ChordToken {
  const first = unlocked[0];
  if (first === undefined) {
    throw new Error("weakestChord: no chord is unlocked");
  }
  const byToken = new Map(standings.map((s) => [s.token, s] as const));
  const rank = (token: ChordToken) => {
    const s = byToken.get(token);
    return {
      mastered: s?.mastered ?? false,
      answers: s?.answers ?? 0,
      // No answers yet reads as the lowest accuracy there is.
      accuracy: s?.accuracy ?? -1,
    };
  };
  let best = first;
  let bestRank = rank(first);
  for (const token of unlocked.slice(1)) {
    const r = rank(token);
    if (weaker(r, bestRank)) {
      best = token;
      bestRank = r;
    }
  }
  return best;
}

type Rank = { mastered: boolean; answers: number; accuracy: number };

function weaker(a: Rank, b: Rank): boolean {
  if (a.mastered !== b.mastered) return !a.mastered;
  if (a.answers !== b.answers) return a.answers < b.answers;
  return a.accuracy < b.accuracy;
}

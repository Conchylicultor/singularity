import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { ChordProgress } from "@plugins/apps/plugins/chord/plugins/progress/core";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";

// ── Is the learner ready for their next step? ────────────────────────────────
//
// Ready means every chord they already have is mastered — the trainer's
// suggestion that now is a good moment to add one more.
//
// There are THREE answers, not two. Until the learner's standing has landed
// nobody can say, and "I cannot tell yet" is not a quiet "no": a button that
// reads "Add anyway" during the load is telling this learner they are behind,
// and then changing its mind. So `unknown` is its own state, and the Add
// controls render it as their own waiting form.

export type StepReadiness =
  /** The standing has not landed: nothing can be said either way. */
  | "unknown"
  /** Some chord is not mastered yet — adding now is going faster than suggested. */
  | "early"
  /** Every chord the learner has is mastered. */
  | "ready";

/**
 * Whether the learner is ready for their next step, from the live progress.
 *
 * The mastery rule itself is the progress plugin's (`chordMastery`), already
 * applied per chord in the standing it reports: a chord counts once its own
 * `mastered` says so. Nothing here restates a threshold.
 */
export function stepReadiness(
  unlocked: readonly ChordToken[],
  progress: ResourceResult<ChordProgress>,
): StepReadiness {
  if (progress.pending) return "unknown";
  const mastered = new Set(
    progress.data.chords.filter((c) => c.mastered).map((c) => c.token),
  );
  return unlocked.every((token) => mastered.has(token)) ? "ready" : "early";
}

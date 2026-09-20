import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { stageById, type NextStep } from "../../core";

// ── What a step is called on screen ──────────────────────────────────────────
//
// A step moves one of two axes, so it reads one of three ways: a chord to
// hear, a family of chords (and the key modes that come with them), or more of
// the loop to name. Every kind gets a name here, so nothing shows up as a blank
// row.

export type StepWording = {
  /** What the step is, in a few words: "vi", "Minor keys", "Name the cadence". */
  headline: string;
  /** One line saying what changes for the learner. */
  detail: string;
  /** The chords the step opens — empty for an ask-rule step or a mode-only one. */
  tokens: readonly ChordToken[];
};

export function stepWording(step: NextStep): StepWording {
  if (step.kind === "ask") {
    return step.rule === "half"
      ? {
          headline: "Name the cadence",
          detail: "Every chord in the second half of the loop, not just one.",
          tokens: [],
        }
      : {
          headline: "Name the whole loop",
          detail: "Every chord from the first beat on.",
          tokens: [],
        };
  }
  const stage = stageById(step.stage);
  const names = step.tokens.map((token) => chordLabel(token).text);
  if (names.length === 0) {
    return {
      headline: stage.title,
      detail: "Songs in this key start playing.",
      tokens: [],
    };
  }
  // One chord is its own headline; a stage's seed arrives as the stage.
  const first = names[0] ?? stage.title;
  return names.length === 1
    ? {
        headline: first,
        detail: `A new chord, from ${stage.title.toLowerCase()}.`,
        tokens: step.tokens,
      }
    : {
        headline: stage.title,
        detail: `${names.join(", ")} together.`,
        tokens: step.tokens,
      };
}

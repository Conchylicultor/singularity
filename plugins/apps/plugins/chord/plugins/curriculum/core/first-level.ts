import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import type { AskRule } from "./ask";
import { stageById, type StageId } from "./stages";

// ── Where everyone starts ────────────────────────────────────────────────────
//
// Level 1 is a constant, not a row: the learner takes their first step FROM it.
// It is the major-triads stage opened — I, IV and V in major keys — with the
// round asking only for the chord being practised.

export type FirstLevel = {
  readonly tokens: readonly ChordToken[];
  readonly modes: readonly HookpadMode[];
  readonly askRule: AskRule;
  /** The stage the starting chords came from: where the ladder carries on. */
  readonly stage: StageId;
};

const start = stageById("major-triads");

export const FIRST_LEVEL: FirstLevel = {
  tokens: start.seed,
  modes: start.modes,
  askRule: "target",
  stage: start.id,
};

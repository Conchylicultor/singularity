/**
 * `@plugins/apps/plugins/sonata/plugins/pitch-layout/core` — HOW pitch is laid
 * across a Sonata surface, and the app's single choice of keyboard layout.
 *
 * Pure, framework-free barrel with no outgoing plugin imports beyond
 * `score/core` (the types) and config_v2/fields (the switch). It owns one config
 * (`pitchLayoutConfig` — `piano` / `janko`) and the closed geometry table behind
 * one entry point (`pitchGeometry`), which the falling notes, the grid rules,
 * the keys below them and the chord readout chips all lay themselves out from
 * instead of each re-deriving a piano.
 *
 * A neutral leaf owns this for the same reason `look` does, and neither
 * consumer can. If `piano-roll` owned it, the keyboard primitive would have to
 * import a display plugin — dragging the roll into the chord readout chips and
 * the website bundle. If the keyboard owned it, the roll would have to import
 * the keyboard for its own note columns and grid. A leaf gives a star topology
 * that cannot cycle.
 *
 * The TYPES live one level lower still, in `score/core`, because that is the
 * zero-import narrow waist every Sonata plugin already reads and it must not
 * drag `config_v2` in. This plugin owns the formulas; the waist owns the shape.
 */

export type { PitchKeyboardSize, PitchLayout } from "./geometry";
export { pitchGeometry, pitchKeyboardHeight } from "./geometry";
export {
  PITCH_LAYOUT_LABELS,
  PITCH_LAYOUT_DEFAULT,
  pitchLayoutConfig,
  asPitchLayoutId,
} from "./config";

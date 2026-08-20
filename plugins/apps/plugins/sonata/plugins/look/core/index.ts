/**
 * `@plugins/apps/plugins/sonata/plugins/look/core` — how the Sonata roll is
 * DRAWN.
 *
 * Pure, framework-free barrel with zero outgoing plugin imports beyond
 * config_v2/fields. It owns one switch ({@link sonataLookConfig}) and the closed
 * palette table every roll surface reads ({@link SONATA_LOOK_STYLES}) instead of
 * hardcoding one set of constants — the lane and grid (piano-roll), the note
 * shader (piano-roll), and the key skin (the keyboard primitive).
 *
 * A neutral leaf owns this because neither consumer can. If `piano-roll` owned
 * it, the keyboard primitive would have to import a display plugin — dragging
 * the roll into the chord readout chips and the website bundle. If the keyboard
 * owned it, the roll would have to import the keyboard for its lane and grid.
 * A leaf gives a star topology that cannot cycle.
 */

export type { SonataLook } from "./config";
export {
  SONATA_LOOKS,
  SONATA_DEFAULT_LOOK,
  sonataLookConfig,
  asSonataLook,
} from "./config";
export type { SonataLookStyle, SonataKeys, SonataDrawnKeys } from "./styles";
export { SONATA_LOOK_STYLES } from "./styles";

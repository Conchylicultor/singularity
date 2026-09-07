import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Keyboard } from "./internal/keyboard";
export type {
  KeyboardProps,
  KeyHighlight,
  KeyRenderState,
} from "./internal/keyboard";
export type { LabelTone } from "./internal/chrome";

// No config of its own. Which of the three skins paints the keys is read
// straight off Sonata's look (`SONATA_LOOK_STYLES[look].keys.skin`) — the
// primitive holds no switch to register and nothing to surface as a view option.
//
// No geometry of its own either: a keyboard is handed the `PitchPlane` the
// falling notes were laid on (`pitch-layout`), so there is nowhere for a second
// key formula to live.
export default {
  description:
    "Stateless keyboard renderer: draws any PitchPlane's pads, lights given pitches (accent or per-key color) with optional per-key content, and picks its chrome from the plane's own layout. Composed by the full PianoKeyboard and the chord/key readouts.",
  contributions: [],
} satisfies PluginDefinition;

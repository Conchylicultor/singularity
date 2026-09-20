import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Keyboard } from "./internal/keyboard";
export { useSonataKeySkin } from "./internal/use-key-skin";
export type {
  KeyboardProps,
  KeyHighlight,
  KeyRenderState,
} from "./internal/keyboard";
export type { LabelTone } from "./internal/chrome";

// No config of its own. Which of the three skins paints the keys ARRIVES as a
// prop — Sonata's surfaces read it off the app's look through the
// `useSonataKeySkin()` hook exported beside the component, so one control still
// paints every keyboard in the app, while a keyboard rendered in another app
// (the Chord trainer's piano) picks its own skin instead of crashing on a
// config only Sonata registers.
//
// No geometry of its own either: a keyboard is handed the `PitchPlane` the
// falling notes were laid on (`pitch-layout`), so there is nowhere for a second
// key formula to live.
export default {
  description:
    "Stateless keyboard renderer: draws any PitchPlane's pads, lights given pitches (accent or per-key color) with optional per-key content, and picks its chrome from the plane's own layout. Composed by the full PianoKeyboard and the chord/key readouts.",
  contributions: [],
} satisfies PluginDefinition;

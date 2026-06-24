import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { keyboardStyleConfig } from "../shared/config";

export { Keyboard } from "./internal/keyboard";
export type { KeyboardProps, KeyHighlight } from "./internal/keyboard";
export { keyLayout, isBlackPitch } from "./internal/key-layout";
export type { KeyLane } from "./internal/key-layout";
export type { KeyStyle } from "../shared/config";
// The key-style descriptor is surfaced as a Sonata player view-option by
// piano-keyboard (the keyboard primitive stays a leaf — it never imports the app
// shell). Exported here so that consumer can hand it to the ViewOption slot.
export { keyboardStyleConfig } from "../shared/config";

export default {
  description:
    "Stateless piano keyboard: the single source of truth for laying out and drawing piano keys across a MIDI range, lighting given pitches (accent or per-key color) with optional per-key content. Composed by the full PianoKeyboard and the chord readout.",
  contributions: [ConfigV2.WebRegister({ descriptor: keyboardStyleConfig })],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Keyboard } from "./internal/keyboard";
export type { KeyboardProps, KeyHighlight } from "./internal/keyboard";
export { keyLayout, isBlackPitch } from "./internal/key-layout";
export type { KeyLane } from "./internal/key-layout";

export default {
  description:
    "Stateless piano keyboard: the single source of truth for laying out and drawing piano keys across a MIDI range, lighting given pitches (accent or per-key color) with optional per-key content. Composed by the full PianoKeyboard and the chord readout.",
  contributions: [],
} satisfies PluginDefinition;

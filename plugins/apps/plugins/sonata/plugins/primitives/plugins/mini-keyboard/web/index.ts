import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { MiniKeyboard } from "./internal/mini-keyboard";
export type { MiniKeyboardProps } from "./internal/mini-keyboard";
export { keyLayout, isBlackPitch } from "./internal/key-layout";
export type { KeyLane } from "./internal/key-layout";

export default {
  description:
    "Stateless mini piano keyboard: renders a MIDI key range and lights up the given pitches. Range-parameterized fractional key geometry, no Sonata context.",
  contributions: [],
} satisfies PluginDefinition;

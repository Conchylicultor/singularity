import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PianoKeyboard } from "./components/piano-keyboard";

export default {
  id: "sonata-piano-keyboard",
  name: "Sonata: Piano Keyboard",
  description:
    "Sonata PitchAxis: full 88-key piano keyboard rendered below the vertical roll. Requires the pitch-plane capability and draws every key from the display's published projection, so falling-note columns land exactly on their keys.",
  contributions: [
    Sonata.PitchAxis({
      id: "piano-keyboard",
      requires: ["pitch-plane"],
      component: PianoKeyboard,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { keyboardStyleConfig } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { PianoKeyboard } from "./components/piano-keyboard";
import { pianoKeyboardConfig } from "../shared/config";

export default {
  description:
    "Sonata PitchAxis: full 88-key piano keyboard rendered below the vertical roll. Requires the pitch-plane capability and draws every key from the display's published projection, so falling-note columns land exactly on their keys.",
  contributions: [
    Sonata.PitchAxis({
      id: "piano-keyboard",
      requires: ["pitch-plane"],
      component: PianoKeyboard,
    }),
    ConfigV2.WebRegister({ descriptor: pianoKeyboardConfig }),
    // Surface the keyboard's display prefs in the player's view-options chip.
    // `key-style` belongs to the keyboard primitive (a leaf that can't import the
    // shell), so this plugin — which already depends on both — surfaces it.
    Sonata.ViewOption({ id: "key-labels", config: pianoKeyboardConfig }),
    Sonata.ViewOption({ id: "key-style", config: keyboardStyleConfig }),
  ],
} satisfies PluginDefinition;

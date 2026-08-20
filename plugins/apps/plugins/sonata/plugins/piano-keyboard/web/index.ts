import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
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
    // Surface this plugin's own display prefs in the player's view-options chip.
    // Scoped to `piano-roll`: the keyboard is a PitchAxis that mounts on the
    // pitch-plane display (today only the piano roll), so these controls only
    // belong to that lens. Add further display ids here if the keyboard ever
    // mounts on another pitch-plane display.
    //
    // How the keys are DRAWN is not here: that is one of the three values of
    // Sonata's look, contributed by the `look` plugin as a single row.
    Sonata.ViewOption({
      id: "key-labels",
      displays: ["piano-roll"],
      config: pianoKeyboardConfig,
    }),
  ],
} satisfies PluginDefinition;

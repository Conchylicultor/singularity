import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { chordLabelConfig } from "../shared/config";

export { useChordDisplayMode } from "./hook";

export default {
  description:
    "Sonata chord-label preference: the single shared symbol/numeral/both display mode that drives the piano-roll overlay and the progression strip in lockstep, surfaced in the View popover.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: chordLabelConfig }),
    // Chords render across lenses (overlay on the piano roll, progression
    // Section beside every lens), so the preference is global to the player.
    Sonata.ViewOption({
      id: "chord-label",
      displays: "global",
      config: chordLabelConfig,
      fields: ["mode"],
    }),
  ],
} satisfies PluginDefinition;

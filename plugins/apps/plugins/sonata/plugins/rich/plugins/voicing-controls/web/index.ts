import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { useHasVoicedChords } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { VoicingControls } from "./components/voicing-controls";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Sonata Section: chord-voicing controls (realistic voice-leading toggle, voicing-strategy picker, octave stepper) writing the global voicing config. Shown only for songs whose chords the shell voices: a symbol source (authored chords), or chord mode on.",
  contributions: [
    Sonata.Section({
      id: "voicing",
      label: "Voicing",
      icon: symbol("piano"),
      component: VoicingControls,
      area: "player",
      useAvailable: useHasVoicedChords,
    }),
  ],
} satisfies PluginDefinition;

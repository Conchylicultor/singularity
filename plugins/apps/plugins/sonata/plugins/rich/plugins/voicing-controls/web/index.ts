import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPiano } from "react-icons/md";
import {
  Sonata,
  useHasAuthoredChord,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { VoicingControls } from "./components/voicing-controls";

export default {
  description:
    "Sonata Section: chord-voicing controls (realistic voice-leading toggle, voicing-strategy picker, octave stepper) writing the global voicing config. Shown only for songs with authored chord annotations.",
  contributions: [
    Sonata.Section({
      id: "voicing",
      label: "Voicing",
      icon: MdPiano,
      component: VoicingControls,
      area: "player",
      useAvailable: useHasAuthoredChord,
    }),
  ],
} satisfies PluginDefinition;

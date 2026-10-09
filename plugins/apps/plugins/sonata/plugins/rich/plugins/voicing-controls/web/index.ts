import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { VoicingControls } from "./components/voicing-controls";

export default {
  description:
    "Sonata accompaniment part: the chord-voicing rows (Voice-leading switch, Octave − C4 + stepper) writing the global voicing config. Contributes no section of its own — the Accompaniment section composes it, gated on the song document's useHasVoicedChords.",
  contributions: [],
} satisfies PluginDefinition;

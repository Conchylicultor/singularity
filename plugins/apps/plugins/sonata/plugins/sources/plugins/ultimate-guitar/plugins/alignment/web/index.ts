import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { UgAlignmentSync } from "./components/alignment-sync";
import { useUgLibrarySong } from "./internal/use-ug-raw";
import {
  RecordingSection,
  RecordingSummary,
} from "./components/recording-section";

export default {
  description:
    "UG sheet alignment in the player: a 'Recording' editor section to paste a song's YouTube link and follow its alignment (aligning, aligned with score and transpose, weak match, failed, out of date), and a headless effect writing the applied alignment record into the Ultimate Guitar raw so the Score plays on the recording's beats.",
  contributions: [
    Sonata.Section({
      id: "ug-alignment-recording",
      label: "Recording",
      icon: symbol("smart-display"),
      component: RecordingSection,
      summary: RecordingSummary,
      area: "editor",
      useAvailable: () => useUgLibrarySong() !== null,
    }),
    Sonata.Effect({ id: "ug-alignment-sync", component: UgAlignmentSync }),
  ],
} satisfies PluginDefinition;

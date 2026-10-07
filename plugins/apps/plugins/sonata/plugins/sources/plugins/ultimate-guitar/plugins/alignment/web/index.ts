import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { SonataRecording } from "@plugins/apps/plugins/sonata/plugins/recording/web";
import { UgAlignmentSync } from "./components/alignment-sync";
import { ReportVideoRefused } from "./components/report-video-refused";
import { useUgLibrarySong } from "./internal/use-ug-raw";
import {
  RecordingSection,
  RecordingSummary,
} from "./components/recording-section";

export default {
  description:
    "UG sheet alignment in the player: a 'Recording' editor section holding the song's YouTube video (the recording plugin's RecordingVideo with its volume — synced to the transport when the song plays on its alignment, a weak match included, else playing on its own) and following how it was found and aligned (finding a video, needs a video, aligning, aligned with score and transpose, weak match, failed, out of date), who picked it, the candidate videos tried (click one to switch), Find a video, and a link field to set one by hand; a headless report of a video the player refuses (SonataRecording.Refused → video-refused), and a headless effect writing the applied alignment record into the Ultimate Guitar raw so the Score plays on the recording's beats.",
  contributions: [
    Sonata.Section({
      id: "ug-alignment-recording",
      label: "Recording",
      icon: symbol("smart-display"),
      component: RecordingSection,
      summary: RecordingSummary,
      area: "editor",
      useAvailable: () => useUgLibrarySong() !== null,
      // Open by default when the song plays on a video (it holds the video);
      // only seeds the persisted toggle, read once per mount.
      useDefaultOpen: () =>
        (useUgLibrarySong()?.raw.alignment ?? null) !== null,
    }),
    Sonata.Effect({ id: "ug-alignment-sync", component: UgAlignmentSync }),
    // The player refused the video: mark the candidate, and re-pick if ours.
    SonataRecording.Refused({
      id: "ug-video-refused",
      component: ReportVideoRefused,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { recordingConfig } from "../shared/config";
import { SonataRecording } from "./slots";

export { SonataRecording } from "./slots";
export { useMediaRefusal, type MediaRefusal } from "./refusal";
// The recording's video, rendered by whoever shows a song's recording (the UG
// alignment's Recording section): the video, its volume, and — when the score
// is timed on it — the transport driver (else a "Not synced" badge).
export { RecordingVideo } from "./components/recording-video";

export default {
  description:
    "Sonata recording: RecordingVideo — a song's YouTube video with its volume (on/off, slider, level) below it, for whoever shows the song's recording to render. When the open score is timed on that video (Score.meta.recording) it is registered as the session's transport driver while mounted and ready — the cursor, the synth and the A–B loop follow the video, its rate is the tempo; otherwise it plays on its own with YouTube's controls under a “Not synced” badge. The video's sound, level and the sync offset (no control in the card; Settings → Config) persist in the sonata.recording config. Owns the SonataRecording.Refused seam for whoever picked a video YouTube refuses to embed.",
  slots: { ...SonataRecording },
  contributions: [ConfigV2.WebRegister({ descriptor: recordingConfig })],
} satisfies PluginDefinition;

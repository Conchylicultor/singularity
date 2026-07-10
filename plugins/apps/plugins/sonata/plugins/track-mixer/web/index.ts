import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { TrackMixerPanel } from "./components/track-mixer-panel";
import { TrackMixerActions } from "./components/track-mixer-actions";
import { useTrackMixerAvailable } from "./hooks";

export {
  useTrackMixerEntries,
  useTrackColorMap,
  useTrackInstrumentMap,
  useHiddenTrackIds,
  useMutedTrackIds,
  type TrackMixerEntry,
} from "./hooks";
export { blackKeyColor } from "./palette";

export default {
  description:
    "Compact per-track control panel for the Sonata player: categorical color, mute (audio), and hide (piano-roll) per track, with name / instrument / note count. State persists per (song, track). Exposes color/hidden/muted hooks consumed by the piano-roll and audio engine.",
  contributions: [
    Sonata.Section({
      id: "track-mixer",
      label: "Tracks",
      icon: MdTune,
      component: TrackMixerPanel,
      area: "player",
      actions: TrackMixerActions,
      useAvailable: useTrackMixerAvailable,
    }),
  ],
} satisfies PluginDefinition;

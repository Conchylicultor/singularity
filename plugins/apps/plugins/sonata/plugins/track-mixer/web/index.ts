import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { TrackMixerPanel } from "./components/track-mixer-panel";
import { TrackMixerActions } from "./components/track-mixer-actions";
import { TrackViewObserver } from "./components/track-view-observer";
import { trackViewSetting } from "./track-view-setting";
import { useTrackMixerAvailable } from "./hooks";

export {
  useTrackMixerEntries,
  useTrackColorMap,
  useTrackInstrumentMap,
  useTrackVolumeMap,
  useHiddenTrackIds,
  useMutedTrackIds,
  type TrackMixerEntry,
} from "./hooks";
export { accidentalColor } from "./palette";
export { setTracksActive } from "./actions";

export default {
  description:
    "Compact per-track control panel for the Sonata player: categorical color, mute (audio), and hide (piano-roll) per track, with name / instrument / note count. State persists per (song, track) and registers with the shell as a per-song setting (Sonata.SongSetting, settled by a headless observer), so the player waits for it. Exposes color/hidden/muted hooks consumed by the piano-roll and audio engine.",
  contributions: [
    Sonata.SongSetting({
      id: "track-view-sync",
      setting: trackViewSetting,
      component: TrackViewObserver,
    }),
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

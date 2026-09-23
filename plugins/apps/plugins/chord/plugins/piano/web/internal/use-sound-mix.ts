import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import type {
  ChannelLevel,
  SoundChannel,
  SoundMix,
} from "@plugins/apps/plugins/chord/plugins/piano/core";
import { chordSoundConfig } from "../../shared/config";

/**
 * What the loop is heard with right now: the song and the piano, each on or
 * off at its own level.
 *
 * Plain `useConfig`, not `useConfigResult`: the config document is hydrated
 * into the boot snapshot and its resource is resident, and the value is a
 * preference, not a claim about the learner's data — for one frame the worst
 * it can do is play at the default level.
 */
export function useSoundMix(): SoundMix {
  const c = useConfig(chordSoundConfig);
  return {
    song: { on: c.songOn, volume: c.songVolume },
    piano: { on: c.pianoOn, volume: c.pianoVolume },
  };
}

/** Set one channel's on/off, level, or both. */
export function useSetSoundChannel(): (
  channel: SoundChannel,
  patch: Partial<ChannelLevel>,
) => void {
  const setConfig = useSetConfig(chordSoundConfig);
  return (channel, patch) => {
    if (patch.on !== undefined) {
      setConfig(channel === "song" ? "songOn" : "pianoOn", patch.on);
    }
    if (patch.volume !== undefined) {
      setConfig(
        channel === "song" ? "songVolume" : "pianoVolume",
        patch.volume,
      );
    }
  };
}

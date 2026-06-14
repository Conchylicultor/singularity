import type { CSSProperties } from "react";
import { MdVolumeDown, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useAudioControls, useAudioState } from "../audio-store";
import "./volume-control.css";

/**
 * The master-volume control pinned into the Sonata top toolbar
 * (`SonataToolbar.End`): a mute toggle (level-reflecting icon) plus a compact
 * slider. Like `transport-bar`'s controls it owns no audio — it only
 * reads/writes the per-surface `audio-store` (provided via the
 * `Sonata.SurfaceProvider` wrapper slot), which the always-mounted `AudioEngine`
 * reads to drive master gain. Living in the engine plugin keeps the
 * `audio-store` import plugin-local.
 */
export function VolumeControl() {
  const { volume } = useAudioState();
  const { setVolume, toggleMute } = useAudioControls();
  const muted = volume === 0;
  const Icon = muted ? MdVolumeOff : volume < 0.5 ? MdVolumeDown : MdVolumeUp;

  return (
    <Stack direction="row" gap="xs" align="center">
      <IconButton
        icon={Icon}
        label={muted ? "Unmute" : "Mute"}
        onClick={toggleMute}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
        className="volume-slider w-28"
        style={{ "--fill": volume * 100 } as CSSProperties}
      />
    </Stack>
  );
}

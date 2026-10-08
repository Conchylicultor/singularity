import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Slider } from "@plugins/primitives/plugins/css/plugins/slider/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useAudioControls, useAudioState } from "../audio-store";
import { symbol } from "@plugins/ui/plugins/icons/core";
import {
  HoverExpandPanel,
  hoverExpandHost,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/toolbar-control/web";

const volumeDownIcon = symbol("volume-down");
const volumeOffIcon = symbol("volume-off");
const volumeUpIcon = symbol("volume-up");

/**
 * The master-volume control pinned into the Sonata top toolbar
 * (`sonataPlayerPane.Actions`): a mute toggle (level-reflecting icon) plus a compact
 * slider. Like `transport-bar`'s controls it owns no audio — it only
 * reads/writes the per-surface `audio-store` (provided via the
 * `SonataSession.Provider` wrapper slot), which the always-mounted `AudioEngine`
 * reads to drive master gain. Living in the engine plugin keeps the
 * `audio-store` import plugin-local.
 *
 * At rest only the speaker shows: the slider is folded away by toolbar-control's
 * hover-expand rule (the jog wheels' rule) and opens on hover or focus — and
 * stays open while it is being dragged, even when the pointer leaves it.
 */
export function VolumeControl() {
  const { volume } = useAudioState();
  const { setVolume, toggleMute } = useAudioControls();
  const muted = volume === 0;
  const Icon = muted
    ? volumeOffIcon
    : volume < 0.5
      ? volumeDownIcon
      : volumeUpIcon;

  return (
    <Stack direction="row" gap="none" align="center" {...hoverExpandHost()}>
      <IconButton
        icon={Icon}
        label={muted ? "Unmute" : "Mute"}
        onClick={toggleMute}
      />
      <HoverExpandPanel>
        {/* The gap to the speaker lives inside the fold, so the folded control
            is exactly the speaker's width; the vertical inset keeps the
            thumb's focus ring inside the fold's clip. */}
        <Inset x="xs" y="2xs">
          <Slider
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setVolume}
            aria-label="Volume"
            className="w-28"
          />
        </Inset>
      </HoverExpandPanel>
    </Stack>
  );
}

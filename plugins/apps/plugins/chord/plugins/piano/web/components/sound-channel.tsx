import {
  MAX_VOLUME,
  type SoundChannel,
} from "@plugins/apps/plugins/chord/plugins/piano/core";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Slider } from "@plugins/primitives/plugins/css/plugins/slider/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useLevelFader } from "../internal/use-level-fader";
import { useSetSoundChannel, useSoundMix } from "../internal/use-sound-mix";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";

const musicNoteIcon = symbol("music-note");
const musicOffIcon = symbol("music-off");
const pianoIcon = symbol("piano");
const pianoOffIcon = symbol("piano-off");

/** How each channel is spelled and drawn. A `Record`, so a third channel is a tsc error here. */
const CHANNEL: Record<
  SoundChannel,
  { name: string; on: IconRef; off: IconRef; turnOn: string; turnOff: string }
> = {
  song: {
    name: "Song",
    on: musicNoteIcon,
    off: musicOffIcon,
    turnOn: "Unmute the song",
    turnOff: "Mute the song (it keeps playing, silently)",
  },
  piano: {
    name: "Piano",
    on: pianoIcon,
    off: pianoOffIcon,
    turnOn: "Play the loop's chords on the piano",
    turnOff: "Stop playing the loop's chords on the piano",
  },
};

/**
 * One channel of what the loop is heard with, set where it lives: the song's
 * on the song card, the piano's on the keyboard. An on/off button, the name,
 * a volume slider and its level. Off keeps the level (dimmed, reading "off"),
 * and moving the slider of an off channel turns it back on — reaching for a
 * level is asking to hear it.
 */
export function SoundChannelControl({ channel }: { channel: SoundChannel }) {
  const mix = useSoundMix();
  const setChannel = useSetSoundChannel();
  const level = mix[channel];
  const meta = CHANNEL[channel];
  const fader = useLevelFader(level.volume, (volume) =>
    setChannel(channel, { volume }),
  );
  return (
    <Line className={cn(rigidClass(), "gap-xs")}>
      <IconButton
        icon={level.on ? meta.on : meta.off}
        label={level.on ? meta.turnOff : meta.turnOn}
        aria-pressed={level.on}
        className={cn(!level.on && "text-muted-foreground")}
        onClick={() => setChannel(channel, { on: !level.on })}
      />
      <Text
        variant="caption"
        tone={level.on ? "muted" : "faint"}
        className={cn("font-semibold", !level.on && "line-through")}
      >
        {meta.name}
      </Text>
      <Slider
        value={fader.value}
        min={0}
        max={MAX_VOLUME}
        step={1}
        aria-label={`${meta.name} volume`}
        className={cn("w-24", !level.on && "opacity-50")}
        onValueChange={(v) => {
          fader.onValueChange(v);
          if (!level.on) setChannel(channel, { on: true });
        }}
      />
      <Text
        as="span"
        variant="caption"
        tone="faint"
        className="w-7 text-right tabular-nums"
      >
        {level.on ? Math.round(fader.value) : "off"}
      </Text>
    </Line>
  );
}

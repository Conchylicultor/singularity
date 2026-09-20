import type { ReactNode } from "react";
import { MdPause, MdPlayArrow } from "react-icons/md";
import type { LoopCandidate } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";

/**
 * The song on screen: the YouTube player (small, 16:9, where the mockup has
 * its thumbnail), the title, artist, section and bar count, and on the right
 * Play / Pause and "Next song ↵".
 *
 * `player` is the mounted `<YouTubePlayer>`: the screen owns it so one player
 * lives across every loop.
 */
export function SongCard({
  loop,
  player,
  playing,
  keyName,
  canPlay,
  checked,
  onTogglePlay,
  onNext,
}: {
  loop: LoopCandidate;
  player: ReactNode;
  playing: boolean;
  /**
   * The song's key as the learner reads it ("G major"), or null while reveal is
   * off. The card stays presentational: the trainer reads the setting.
   */
  keyName: string | null;
  /** The player is ready to take play / pause. */
  canPlay: boolean;
  /** The round is checked: "Next song" becomes the main action. */
  checked: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
}) {
  return (
    <Card className="rounded-2xl">
      <Line className="gap-md">
        <Clip
          className={cn(
            rigidClass(),
            "relative aspect-video w-[168px] max-w-[40%] rounded-lg bg-muted",
          )}
        >
          {player}
        </Clip>
        <Fill>
          <Stack gap="2xs">
            <Text variant="caption" tone="faint" className="font-semibold">
              Now listening
            </Text>
            <Line>
              <Text as="h1" variant="title" className="font-bold">
                {loop.song}
              </Text>
            </Line>
            <Line>
              <Text variant="body" tone="muted">
                {loop.artist}
              </Text>
            </Line>
            <Line className="gap-xs">
              <Text
                variant="caption"
                tone="muted"
                className="rounded-full bg-background px-xs"
              >
                {loop.sectionName}, {loop.window.bars} bars
              </Text>
              {keyName !== null && (
                <Text
                  variant="caption"
                  tone="muted"
                  className="rounded-full bg-background px-xs"
                >
                  {keyName}
                </Text>
              )}
            </Line>
          </Stack>
        </Fill>
        <Line className={cn(rigidClass(), "gap-sm")}>
          <button
            type="button"
            className="chord-play"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!canPlay}
            onClick={onTogglePlay}
          >
            <Center as="span" className="size-full">
              {playing ? <MdPause /> : <MdPlayArrow />}
            </Center>
          </button>
          <Button variant={checked ? "default" : "outline"} onClick={onNext}>
            Next song <Kbd>↵</Kbd>
          </Button>
        </Line>
      </Line>
    </Card>
  );
}

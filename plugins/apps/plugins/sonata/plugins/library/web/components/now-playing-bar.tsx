import { MdMusicNote, MdPause, MdPlayArrow } from "react-icons/md";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useOpenSong } from "../hooks";

/**
 * Compact now-playing bar at the bottom of the library. Shown only while a song
 * is loaded as the current transport song (`currentSongId != null`) — i.e. after
 * a card/row "Play" loaded one in the background — and `null` otherwise. It
 * surfaces the in-place playback the library started without navigating: the
 * song identity, a play/pause toggle, and the shared transport scrubber for
 * seeking. Clicking the title opens the full player.
 */
export function NowPlayingBar() {
  const { currentSongId, currentSongTitle, isPlaying, play, stop } = useSonata();
  const openSong = useOpenSong();
  if (!currentSongId) return null;
  const title = currentSongTitle ?? "Untitled";
  return (
    <div className="border-t border-border bg-background">
      <Inset x="xl" y="sm">
        <Stack direction="row" align="center" gap="md">
          <Center className="size-8 rounded-md bg-primary/10 text-primary">
            <MdMusicNote className="size-4" />
          </Center>
          {/* Title block — rigid (capped width), title truncates in its Line. */}
          <button
            type="button"
            aria-label={`Open ${title} in player`}
            onClick={() => openSong({ id: currentSongId, title })}
            className="w-44 text-left hover:underline"
          >
            <Stack gap="none">
              <Text variant="eyebrow" tone="muted">
                Now playing
              </Text>
              <Line>
                <Text variant="caption" className="font-medium text-foreground">
                  {title}
                </Text>
              </Line>
            </Stack>
          </button>
          <IconButton
            icon={isPlaying ? MdPause : MdPlayArrow}
            label={isPlaying ? "Pause" : "Play"}
            onClick={() => (isPlaying ? stop() : play())}
          />
          {/* Reuse the shared transport scrubber as the interactive seek bar. */}
          <Fill>
            <Sonata.Transport.Render>
              {(t) => <t.component key={t.id} />}
            </Sonata.Transport.Render>
          </Fill>
        </Stack>
      </Inset>
    </div>
  );
}

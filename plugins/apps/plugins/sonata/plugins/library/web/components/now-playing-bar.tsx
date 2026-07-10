import { MdMusicNote, MdPause, MdPlayArrow } from "react-icons/md";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useOpenSong } from "../hooks";
import { useCurrentSong } from "../use-current-song";

/**
 * Compact now-playing bar at the bottom of the library. Shown only while a song
 * is loaded as the current transport song — i.e. after a card/row "Play" loaded
 * one in the background — and `null` otherwise. It surfaces the in-place
 * playback the library started without navigating: the song identity, a
 * play/pause toggle, and the shared transport scrubber for seeking. Clicking the
 * title opens the full player. The title is read from the canonical
 * `songsResource` row (`useCurrentSong`), never a shell-context mirror.
 */
export function NowPlayingBar() {
  const { isPlaying, play, stop } = useSonata();
  const current = useCurrentSong();
  const openSong = useOpenSong();
  // Nothing to show until the open song's canonical row is available (no song
  // open, or the songs resource still loading).
  if (current.pending || !current.data) return null;
  const song = current.data;
  const title = song.title;
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
            onClick={() => openSong({ id: song.id, title })}
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

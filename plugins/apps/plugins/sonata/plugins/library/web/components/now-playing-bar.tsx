import type { ReactNode } from "react";
import {
  Sonata,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useOpenSong } from "../hooks";
import { useCurrentSong } from "../use-current-song";
import type { Song } from "../../core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const musicNoteIcon = symbol("music-note");
const pauseIcon = symbol("pause");
const playArrowIcon = symbol("play-arrow");

/**
 * Compact now-playing bar at the bottom of the library. Shown only while a song
 * is loaded as the current transport song — i.e. after a card/row "Play" loaded
 * one in the background — and `null` otherwise. It surfaces the in-place
 * playback the library started without navigating: the song identity, a
 * play/pause toggle, and the shared transport scrubber for seeking. Clicking the
 * title opens the full player. The title is read from the canonical library
 * row (`useCurrentSong`), never a shell-context mirror.
 */
export function NowPlayingBar() {
  const { isPlaying, play, stop } = useSonata();
  const current = useCurrentSong();
  const openSong = useOpenSong();
  // While the open song's row loads — pressing Play on another song mints a
  // new point read — the bar STAYS and only its title waits (a shimmer, or the
  // read's error over the row as last seen), so a song change never blinks the
  // bar out and back.
  let song: Song | undefined;
  switch (current.status) {
    case "loading":
      song = undefined;
      break;
    case "error":
      song = current.stale;
      break;
    case "ready":
      // No song open, or the open id names no song: no bar.
      if (!current.found) return null;
      song = current.row;
      break;
  }
  return (
    <div className="border-t border-border bg-background">
      <Inset x="xl" y="sm">
        <Stack direction="row" align="center" gap="md">
          <Center className="size-8 rounded-md bg-primary/10 text-primary">
            <Icon icon={musicNoteIcon} className="size-4" />
          </Center>
          {/* Title block — rigid (capped width), title truncates in its Line. */}
          {song !== undefined ? (
            <button
              type="button"
              aria-label={`Open ${song.title} in player`}
              onClick={() => openSong({ id: song.id, title: song.title })}
              className="w-44 text-left hover:underline"
            >
              <NowPlayingTitle>
                <Text variant="caption" className="font-medium text-foreground">
                  {song.title}
                </Text>
              </NowPlayingTitle>
            </button>
          ) : (
            <div className="w-44">
              <NowPlayingTitle>
                {current.status === "error" ? (
                  <ResourceErrorInline
                    error={current.error}
                    refetch={current.refetch}
                    variant="inline"
                  />
                ) : (
                  <Loading variant="block" className="h-4 w-32" />
                )}
              </NowPlayingTitle>
            </div>
          )}
          <IconButton
            icon={isPlaying ? pauseIcon : playArrowIcon}
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

/** The title block's two lines: the "Now playing" eyebrow over the title slot. */
function NowPlayingTitle({ children }: { children: ReactNode }) {
  return (
    <Stack gap="none">
      <Text variant="eyebrow" tone="muted">
        Now playing
      </Text>
      <Line>{children}</Line>
    </Stack>
  );
}

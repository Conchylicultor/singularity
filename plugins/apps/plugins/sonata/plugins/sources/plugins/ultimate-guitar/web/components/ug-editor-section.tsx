import { useEffect, useRef } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { UgTabSchema } from "../../core";
import { UltimateGuitarLoader } from "../loader";
import { compile } from "../compile";
import { UG_SOURCE_ID } from "../constants";
import { updateUltimateGuitarSong } from "../../shared/endpoints";

const SAVE_DEBOUNCE_MS = 500;

/**
 * In-player editor for an Ultimate Guitar song, contributed to `Sonata.Section`
 * (`area: "editor"`). Mounts the `UltimateGuitarLoader`, writing the fetched
 * `UgTab` straight into the context (`setSourceRaw` → live score recompile), and
 * debounce-persists a full snapshot to the server. Renders only for songs that
 * carry UG data (`sourceRaw` defined), so it stays hidden for other sources.
 *
 * Unlike the chord-grid editor, there is NO title input — a UG song is imported,
 * not authored, so its title derives from the tab's `songName`. When a different
 * tab is loaded in-player, the persist syncs the parent song's title and the
 * live header is kept in sync via `renameCurrentSong`.
 */
export function UltimateGuitarEditorSection() {
  const {
    sourceRaw,
    setSourceRaw,
    currentSongId,
    currentSongTitle,
    renameCurrentSong,
    songOpenEpoch,
  } = useSonata();

  const rawValue = sourceRaw(UG_SOURCE_ID);

  // Debounced server persistence. We treat the context (rawById) as the source
  // of truth and sync the server eventually — never on the fresh load that
  // opening a song triggers (which bumps `songOpenEpoch`), only on edits.
  const seededEpoch = useRef(songOpenEpoch);
  useEffect(() => {
    if (!currentSongId || rawValue === undefined) return;
    // Skip the echo right after a song opens (hydrate set raw / bumped epoch).
    if (seededEpoch.current !== songOpenEpoch) {
      seededEpoch.current = songOpenEpoch;
      return;
    }
    const parsed = UgTabSchema.safeParse(rawValue);
    if (!parsed.success) return;
    const id = currentSongId;
    const tab = parsed.data;
    // Keep the live header in sync when a different tab is loaded in-player.
    // `renameCurrentSong` is a stable context callback (only updates in-memory
    // title), so guarding on inequality avoids a render loop.
    if (currentSongTitle !== tab.songName) renameCurrentSong(tab.songName);
    const timer = setTimeout(() => {
      const score = compile(tab);
      const endBeat = scoreEndBeat(score);
      void fetchEndpoint(
        updateUltimateGuitarSong,
        { id },
        {
          body: { ...tab, durationSec: beatToSeconds(score, endBeat), endBeat },
        },
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    rawValue,
    currentSongId,
    currentSongTitle,
    renameCurrentSong,
    songOpenEpoch,
  ]);

  // Gate to Ultimate Guitar songs only (hooks above always run — rules-of-hooks safe).
  if (rawValue === undefined) return null;

  return (
    <Card className="rounded-lg p-lg">
      <UltimateGuitarLoader
        raw={rawValue}
        onRaw={(r) => setSourceRaw(UG_SOURCE_ID, r)}
      />
    </Card>
  );
}

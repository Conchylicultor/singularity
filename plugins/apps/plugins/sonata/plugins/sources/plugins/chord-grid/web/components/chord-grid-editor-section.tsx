import { useEffect, useRef } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ChordGridLoader } from "../loader";
import { asChordGridRaw, compile } from "../compile";
import { CHORD_GRID_SOURCE_ID } from "../constants";
import { updateChordGridSong } from "../../shared/endpoints";

const SAVE_DEBOUNCE_MS = 500;

/**
 * In-player editor for a chord-grid song, contributed to `Sonata.Section`
 * (`area: "editor"`). Mounts the existing `ChordGridLoader` + an editable title,
 * writing edits straight into the context (`setSourceRaw` → live score recompile,
 * `renameCurrentSong` → live header), and debounce-persists a full snapshot to the
 * server. Renders only for songs that carry chord-grid data (`sourceRaw` defined),
 * so it stays hidden for MIDI-only songs.
 */
export function ChordGridEditorSection() {
  const {
    sourceRaw,
    setSourceRaw,
    currentSongId,
    currentSongTitle,
    renameCurrentSong,
    songOpenEpoch,
  } = useSonata();

  const rawValue = sourceRaw(CHORD_GRID_SOURCE_ID);

  // Debounced server persistence. We treat the context (rawById + currentSongTitle)
  // as the source of truth and sync the server eventually — never on the fresh
  // load that opening a song triggers (which bumps `songOpenEpoch`), only on edits.
  const seededEpoch = useRef(songOpenEpoch);
  useEffect(() => {
    if (!currentSongId || rawValue === undefined) return;
    // Skip the echo right after a song opens (hydrate set raw / bumped epoch).
    if (seededEpoch.current !== songOpenEpoch) {
      seededEpoch.current = songOpenEpoch;
      return;
    }
    const id = currentSongId;
    const raw = asChordGridRaw(rawValue);
    const title = currentSongTitle ?? "Untitled";
    const timer = setTimeout(() => {
      const score = compile(raw);
      const endBeat = scoreEndBeat(score);
      void fetchEndpoint(
        updateChordGridSong,
        { id },
        {
          body: {
            title,
            chordText: raw.text,
            voicingId: raw.voicingId,
            octave: raw.octave,
            durationSec: beatToSeconds(score, endBeat),
            endBeat,
          },
        },
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawValue, currentSongTitle, currentSongId, songOpenEpoch]);

  // Gate to chord-grid songs only (hooks above always run — rules-of-hooks safe).
  if (rawValue === undefined) return null;

  return (
    <Card className="rounded-lg p-lg">
      <Stack gap="md">
        <label className="flex flex-col gap-xs">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Title
          </span>
          <input
            type="text"
            value={currentSongTitle ?? ""}
            onChange={(e) => renameCurrentSong(e.target.value)}
            placeholder="Untitled"
            className="w-full rounded-md border border-border bg-background px-md py-xs text-body outline-none focus:border-primary"
          />
        </label>
        <ChordGridLoader
          raw={rawValue}
          onRaw={(r) => setSourceRaw(CHORD_GRID_SOURCE_ID, r)}
        />
      </Stack>
    </Card>
  );
}

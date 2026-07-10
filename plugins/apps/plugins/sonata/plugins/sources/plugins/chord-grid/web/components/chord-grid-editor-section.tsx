import { useEffect, useRef } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
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
 * (`area: "editor"`). Mounts the `ChordGridLoader`, writing edits straight into
 * the context (`setSourceRaw` → live score recompile), and debounce-persists the
 * grid text plus its derived metrics to the server. Renders only for songs that
 * carry chord-grid data (`sourceRaw` defined), so it stays hidden for MIDI-only
 * songs.
 *
 * The title is NOT edited here — it is generic, source-agnostic metadata owned
 * by the library and edited from the player toolbar title (patched via
 * `PATCH /api/sonata/songs/:id`); this save carries only the grid.
 */
export function ChordGridEditorSection() {
  const { sourceRaw, setSourceRaw, currentSongId, songOpenEpoch } = useSonata();

  const rawValue = sourceRaw(CHORD_GRID_SOURCE_ID);

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
    const id = currentSongId;
    const raw = asChordGridRaw(rawValue);
    const timer = setTimeout(() => {
      const score = compile(raw);
      const endBeat = scoreEndBeat(score);
      void fetchEndpoint(
        updateChordGridSong,
        { id },
        {
          body: {
            chordText: raw.text,
            durationSec: beatToSeconds(score, endBeat),
            endBeat,
          },
        },
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawValue, currentSongId, songOpenEpoch]);

  // Gate to chord-grid songs only (hooks above always run — rules-of-hooks safe).
  if (rawValue === undefined) return null;

  return (
    <Card className="rounded-lg p-lg">
      <ChordGridLoader
        raw={rawValue}
        onRaw={(r) => setSourceRaw(CHORD_GRID_SOURCE_ID, r)}
      />
    </Card>
  );
}

import { useCallback, useMemo } from "react";
import {
  useRhythmGroove,
  useSetRhythmGroove,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  defaultBassPattern,
  defaultChordPattern,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import {
  DEFAULT_BASS_FIGURATION_ID,
  DEFAULT_CHORD_FIGURATION_ID,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { rhythmResource } from "../shared/resources";
import { useSaveRhythm } from "./actions";

/**
 * The four per-hand fields of a groove — each hand's rhythm necklace (*when*) and
 * tone-order figuration id (*what*). The `commit` payload: callers spread the
 * resolved groove and override one field.
 */
export interface GrooveFields {
  bass: RhythmPattern;
  chord: RhythmPattern;
  bassFigurationId: string;
  chordFigurationId: string;
}

/** The resolved groove for the open song, plus the optimistic-commit writer. */
export interface Groove extends GrooveFields {
  /** Enabled ⇔ the shell store holds a groove for the open song. */
  enabled: boolean;
  /**
   * Optimistically drive playback (shell store) and persist. Pass `on=false` to
   * disable (store cleared to `null`); the observer re-affirms the same value on
   * the next push.
   */
  commit: (next: GrooveFields, on: boolean) => void;
}

/**
 * Single source of the open song's groove, shared by the section BODY
 * (`RhythmControls`) and its header control (`RhythmActions`), so the On/Off
 * toggle in the collapsed card and the circle in the open card read and write
 * the exact same state.
 *
 * The live resource is display truth (it remembers both patterns + figuration ids
 * even while disabled); the shell store carries the optimistic live value for
 * instant playback.
 */
export function useGroove(): Groove {
  const { currentSongId } = useSonata();
  const storeGroove = useRhythmGroove();
  const setGroove = useSetRhythmGroove();
  const saveRhythm = useSaveRhythm();

  const rows = useResource(rhythmResource);
  const persisted = useMemo(() => {
    if (rows.pending || !currentSongId) return null;
    return rows.data.find((r) => r.songId === currentSongId) ?? null;
  }, [rows, currentSongId]);

  const enabled = storeGroove != null;
  const bass = storeGroove?.hands.bass ?? persisted?.bass ?? defaultBassPattern();
  const chord =
    storeGroove?.hands.chord ?? persisted?.chord ?? defaultChordPattern();
  const bassFigurationId =
    storeGroove?.bassFigurationId ??
    persisted?.bassPatternId ??
    DEFAULT_BASS_FIGURATION_ID;
  const chordFigurationId =
    storeGroove?.chordFigurationId ??
    persisted?.chordPatternId ??
    DEFAULT_CHORD_FIGURATION_ID;

  const commit = useCallback(
    (next: GrooveFields, on: boolean) => {
      setGroove(
        on
          ? {
              hands: { bass: next.bass, chord: next.chord },
              bassFigurationId: next.bassFigurationId,
              chordFigurationId: next.chordFigurationId,
            }
          : null,
      );
      if (currentSongId) {
        saveRhythm(currentSongId, {
          enabled: on,
          bass: next.bass,
          chord: next.chord,
          bassPatternId: next.bassFigurationId,
          chordPatternId: next.chordFigurationId,
        });
      }
    },
    [setGroove, saveRhythm, currentSongId],
  );

  return { enabled, bass, chord, bassFigurationId, chordFigurationId, commit };
}

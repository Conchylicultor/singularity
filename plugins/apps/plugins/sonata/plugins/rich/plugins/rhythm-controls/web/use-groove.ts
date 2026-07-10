import { useCallback, useMemo } from "react";
import {
  useRhythmHands,
  useSetRhythmHands,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  defaultBassPattern,
  defaultChordPattern,
  type RhythmHands,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { rhythmResource } from "../shared/resources";
import { useSaveRhythm } from "./actions";

/** The resolved groove for the open song, plus the optimistic-commit writer. */
export interface Groove {
  /** Enabled ⇔ the shell store holds hands for the open song. */
  enabled: boolean;
  /** Left-hand (bass) pattern: store (live) → persisted (remembered) → default. */
  bass: RhythmPattern;
  /** Right-hand (chord) pattern: store (live) → persisted (remembered) → default. */
  chord: RhythmPattern;
  /**
   * Optimistically drive playback (shell store) and persist. Pass `on=false` to
   * disable (store cleared to `null`); the observer re-affirms the same value on
   * the next push.
   */
  commit: (next: RhythmHands, on: boolean) => void;
}

/**
 * Single source of the open song's groove, shared by the section BODY
 * (`RhythmControls`) and its header control (`RhythmActions`), so the On/Off
 * toggle in the collapsed card and the circle in the open card read and write
 * the exact same state.
 *
 * The live resource is display truth (it remembers both patterns even while
 * disabled); the shell store carries the optimistic live value for instant
 * playback.
 */
export function useGroove(): Groove {
  const { currentSongId } = useSonata();
  const storeHands = useRhythmHands();
  const setHands = useSetRhythmHands();
  const saveRhythm = useSaveRhythm();

  const rows = useResource(rhythmResource);
  const persisted = useMemo(() => {
    if (rows.pending || !currentSongId) return null;
    return rows.data.find((r) => r.songId === currentSongId) ?? null;
  }, [rows, currentSongId]);

  const enabled = storeHands != null;
  const bass = storeHands?.bass ?? persisted?.bass ?? defaultBassPattern();
  const chord = storeHands?.chord ?? persisted?.chord ?? defaultChordPattern();

  const commit = useCallback(
    (next: RhythmHands, on: boolean) => {
      setHands(on ? next : null);
      if (currentSongId) {
        saveRhythm(currentSongId, {
          enabled: on,
          bass: next.bass,
          chord: next.chord,
        });
      }
    },
    [setHands, saveRhythm, currentSongId],
  );

  return { enabled, bass, chord, commit };
}

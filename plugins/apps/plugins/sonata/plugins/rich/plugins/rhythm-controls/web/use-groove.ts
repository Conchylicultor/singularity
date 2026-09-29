import { useCallback } from "react";
import {
  grooveSetting,
  useSongSetting,
  useSonata,
  useWriteSongSetting,
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
import { useLiveRow } from "@plugins/network/plugins/live/web";
import {
  combineResources,
  mapResource,
  type GateInput,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { rhythms } from "../shared/resources";
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

/** A known groove: the resolved fields, whether it is on, and its writer. */
export type GrooveState = GrooveFields & {
  /** Enabled ⇔ the loaded song's `grooveSetting` holds a groove. */
  enabled: boolean;
  /**
   * Optimistically drive playback (the setting) and persist. Pass `on=false`
   * to disable (setting cleared to `null`); the observer re-affirms the same
   * value on the next push.
   */
  commit: (next: GrooveFields, on: boolean) => void;
};

/**
 * The resolved groove for the open song, plus the optimistic-commit writer —
 * `loading` while the song's groove is not known yet (the controls render a
 * loading state, never the default patterns standing in for the song's own),
 * `error` when the song's rhythm row failed to load.
 */
export type Groove = ResourceResult<GrooveState>;

/**
 * Single source of the open song's groove, shared by the section BODY
 * (`RhythmControls`) and its header control (`RhythmActions`), so the On/Off
 * toggle in the collapsed card and the circle in the open card read and write
 * the exact same state.
 *
 * Two halves, both needed before anything is shown: the setting carries
 * whether the groove is on and its optimistic live value (instant playback),
 * and the song's `rhythms` row is display truth (it remembers both patterns +
 * figuration ids even while the groove is off). An absent row is a song whose
 * groove was never configured: the default patterns ARE its patterns.
 */
export function useGroove(): Groove {
  const { currentSongId } = useSonata();
  const store = useSongSetting(grooveSetting);
  const setGroove = useWriteSongSetting(grooveSetting);
  const saveRhythm = useSaveRhythm();
  const row = useLiveRow(rhythms, currentSongId);

  const commit = useCallback(
    (next: GrooveFields, on: boolean) => {
      if (currentSongId === null) return;
      setGroove(
        currentSongId,
        on
          ? {
              hands: { bass: next.bass, chord: next.chord },
              bassFigurationId: next.bassFigurationId,
              chordFigurationId: next.chordFigurationId,
            }
          : null,
      );
      saveRhythm(currentSongId, {
        enabled: on,
        bass: next.bass,
        chord: next.chord,
        bassPatternId: next.bassFigurationId,
        chordPatternId: next.chordFigurationId,
      });
    },
    [setGroove, saveRhythm, currentSongId],
  );

  // Both halves gate the groove: the setting (a SongSetting — pending, failed
  // or settled) and the row read — loading until both have settled, and a
  // failure of either fails the groove. The setting enters the combine through
  // its state alone, so its failure keeps its error.
  const setting: GateInput =
    store.kind === "failed"
      ? { status: "error", error: store.error }
      : { status: store.kind === "settled" ? "ready" : "loading" };
  const gate = combineResources({ setting, row });
  return mapResource(gate, (): GrooveState => {
    // `gate` is ready ⇒ both halves are settled.
    if (
      store.kind !== "settled" ||
      row.status === "loading" ||
      row.status === "error"
    ) {
      throw new Error("useGroove: a ready gate over an unsettled input");
    }
    const live = store.value;
    const persisted = row.found ? row.row : null;
    return {
      enabled: live !== null,
      bass: live?.hands.bass ?? persisted?.bass ?? defaultBassPattern(),
      chord: live?.hands.chord ?? persisted?.chord ?? defaultChordPattern(),
      bassFigurationId:
        live?.bassFigurationId ??
        persisted?.bassPatternId ??
        DEFAULT_BASS_FIGURATION_ID,
      chordFigurationId:
        live?.chordFigurationId ??
        persisted?.chordPatternId ??
        DEFAULT_CHORD_FIGURATION_ID,
      commit,
    };
  });
}

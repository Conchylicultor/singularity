import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { trackViewResource, type TrackViewRow } from "../shared/resources";
import { defaultTrackColor } from "./palette";

/** A track row resolved for display: score metadata + effective view-state. */
export interface TrackMixerEntry {
  trackId: string;
  /** Index in `score.tracks` (drives the default palette color). */
  index: number;
  /** Human label: MIDI track name → instrument hint → "Track N". */
  name: string;
  /** Parsed instrument hint, or null when the source carried none. */
  instrument: string | null;
  /** Notes belonging to this track in the current score. */
  noteCount: number;
  /** Effective color (override ?? palette default). */
  color: string;
  muted: boolean;
  hidden: boolean;
  /** Whether any field has a persisted override (drives reset affordance). */
  customized: boolean;
}

const EMPTY: TrackViewRow[] = [];

/** Persisted overrides for the open song, keyed by trackId. */
function useCurrentSongOverrides(): Map<string, TrackViewRow> {
  const { currentSongId } = useSonata();
  const result = useResource(trackViewResource);
  const rows = result.pending ? EMPTY : result.data;
  return useMemo(() => {
    const m = new Map<string, TrackViewRow>();
    if (!currentSongId) return m;
    for (const r of rows) if (r.songId === currentSongId) m.set(r.trackId, r);
    return m;
  }, [rows, currentSongId]);
}

/**
 * The full resolved track list for the open song — the single source the panel
 * renders and the narrower hooks below derive from. Combines `score.tracks`
 * (order → default color, plus name/instrument) with the persisted overrides
 * and a per-track note tally.
 */
export function useTrackMixerEntries(): TrackMixerEntry[] {
  const { score } = useSonata();
  const overrides = useCurrentSongOverrides();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of score.notes) {
      counts.set(n.track, (counts.get(n.track) ?? 0) + 1);
    }
    return score.tracks.map((t, i) => {
      const row = overrides.get(t.id);
      const name = t.name?.trim() || t.instrumentHint?.trim() || `Track ${i + 1}`;
      return {
        trackId: t.id,
        index: i,
        name,
        instrument: t.instrumentHint?.trim() || null,
        noteCount: counts.get(t.id) ?? 0,
        color: row?.color ?? defaultTrackColor(i),
        muted: row?.muted ?? false,
        hidden: row?.hidden ?? false,
        customized: row !== undefined,
      };
    });
  }, [score.tracks, score.notes, overrides]);
}

/** Effective color per trackId — consumed by the piano-roll note renderer. */
export function useTrackColorMap(): Map<string, string> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Map(entries.map((e) => [e.trackId, e.color])),
    [entries],
  );
}

/** Track ids hidden from the piano-roll. */
export function useHiddenTrackIds(): ReadonlySet<string> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Set(entries.filter((e) => e.hidden).map((e) => e.trackId)),
    [entries],
  );
}

/** Track ids silenced in the audio scheduler. */
export function useMutedTrackIds(): ReadonlySet<string> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Set(entries.filter((e) => e.muted).map((e) => e.trackId)),
    [entries],
  );
}

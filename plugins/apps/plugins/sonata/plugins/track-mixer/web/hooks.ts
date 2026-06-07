import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
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
  /**
   * Resolved instrument id — the registered `Sonata.Instrument` this track
   * sounds with: the persisted override (if still a valid id), else the timbre
   * matching the track's GM program, else the default instrument. This is the
   * functional value the audio engine routes on (`instrument` above is just the
   * raw display hint).
   */
  instrumentId: string;
  /** Display label of the resolved instrument (falls back to its id). */
  instrumentLabel: string;
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

  // Registered timbres, read generically — never names a contributor. The
  // metadata fields (`id`, `label`, `gmProgram`, `default`) drive per-track
  // instrument resolution; `createVoices` is consumed only by the audio engine.
  const instruments = Sonata.Instrument.useContributions();
  const instrumentIndex = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    const byProgram = new Map<number, string>();
    let defaultId: string | null = null;
    for (const c of instruments) {
      byId.set(c.id, { id: c.id, label: c.label });
      if (c.gmProgram !== undefined && !byProgram.has(c.gmProgram)) {
        byProgram.set(c.gmProgram, c.id);
      }
      if (c.default && defaultId === null) defaultId = c.id;
    }
    // Fallback chain for tracks with no program/override: the declared default,
    // else the first contributed instrument (stable order).
    const fallbackId = defaultId ?? instruments[0]?.id ?? null;
    return { byId, byProgram, fallbackId };
  }, [instruments]);

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of score.notes) {
      counts.set(n.track, (counts.get(n.track) ?? 0) + 1);
    }
    const { byId, byProgram, fallbackId } = instrumentIndex;
    return score.tracks.map((t, i) => {
      const row = overrides.get(t.id);
      const name = t.name?.trim() || t.instrumentHint?.trim() || `Track ${i + 1}`;

      // Resolution precedence: (1) a non-null override that still matches a
      // registered id, (2) the timbre matching the track's GM program, (3) the
      // default / first instrument. Always yields a registered id (empty string
      // only if no instruments are registered at all).
      const overrideId =
        row?.instrument != null && byId.has(row.instrument)
          ? row.instrument
          : null;
      const programId =
        t.gmProgram !== undefined ? (byProgram.get(t.gmProgram) ?? null) : null;
      const instrumentId = overrideId ?? programId ?? fallbackId ?? "";
      const instrumentLabel = byId.get(instrumentId)?.label ?? instrumentId;

      return {
        trackId: t.id,
        index: i,
        name,
        instrument: t.instrumentHint?.trim() || null,
        instrumentId,
        instrumentLabel,
        noteCount: counts.get(t.id) ?? 0,
        color: row?.color ?? defaultTrackColor(i),
        muted: row?.muted ?? false,
        hidden: row?.hidden ?? false,
        customized: row !== undefined,
      };
    });
  }, [score.tracks, score.notes, overrides, instrumentIndex]);
}

/** Effective color per trackId — consumed by the piano-roll note renderer. */
export function useTrackColorMap(): Map<string, string> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Map(entries.map((e) => [e.trackId, e.color])),
    [entries],
  );
}

/**
 * Resolved instrument id per trackId — consumed by the audio engine to route
 * each track's notes to its own voice manager. The value is the effective
 * instrument (override ?? GM-program match ?? default), never the raw override.
 */
export function useTrackInstrumentMap(): Map<string, string> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Map(entries.map((e) => [e.trackId, e.instrumentId])),
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

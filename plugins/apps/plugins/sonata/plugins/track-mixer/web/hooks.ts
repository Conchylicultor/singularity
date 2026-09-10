import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SonataAudio } from "@plugins/apps/plugins/sonata/plugins/audio/plugins/instruments/web";
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
   * Resolved instrument id — the registered `SonataAudio.Instrument` this track
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
  /**
   * Fader position as a linear gain multiplier: 1 is unity (the track as
   * recorded), 0 is silent, 2 is +6 dB. Defaults to 1 for a track with no
   * persisted row. This is a separate concept from `muted`: mute drops the
   * track's notes upstream, so a muted track gets no audio channel at all,
   * while `volume: 0` is a fader position on a channel that keeps existing and
   * keeps being scheduled — which is what makes raising it again instant.
   */
  volume: number;
  /**
   * Whether ANY field has a persisted override — drives the per-song reset
   * affordance, which deletes the whole row. Use `instrumentCustomized` for the
   * narrower "has this track's timbre been chosen by hand?" question.
   */
  customized: boolean;
  /**
   * Whether the track's timbre was chosen by hand, as opposed to derived from
   * its GM program or the default instrument. This is what the instrument
   * picker asks, and it must NOT be `customized`: a row exists the moment the
   * user mutes the track or moves its fader, and reading that as "instrument
   * overridden" would make the picker stop showing "Auto" and mark the merely
   * resolved instrument as an explicit choice.
   */
  instrumentCustomized: boolean;
}

/** Persisted overrides for the open song, keyed by trackId. */
function useCurrentSongOverrides(): Map<string, TrackViewRow> {
  const { currentSongId } = useSonata();
  const result = useResource(trackViewResource);
  // Empty map while pending is genuinely correct: tracks fall back to palette-
  // default color, muted=false, hidden=false, volume=1 — the same defaults an
  // unoverridden track would have at any point. Piano-roll and audio engine work
  // correctly with these defaults while overrides are still loading.
  //
  // `volume` does not change that reasoning: a not-yet-loaded track reading as
  // unity gain is the same class of default as reading as audible + visible —
  // the track as recorded, which is what it would be with no row at all. What
  // would break the argument is a default that is a *claim* about the user's
  // data rather than the absence of one (a fader parked at zero, say); unity is
  // the absence of an opinion, so a late-arriving override moves the level from
  // "untouched" to the user's position rather than reversing a stated one.
  return useMemo(() => {
    const m = new Map<string, TrackViewRow>();
    if (!currentSongId) return m;
    if (result.pending) return m;
    for (const r of result.data)
      if (r.songId === currentSongId) m.set(r.trackId, r);
    return m;
  }, [result, currentSongId]);
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
  const instruments = SonataAudio.Instrument.useContributions();
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
      const name =
        t.name?.trim() || t.instrumentHint?.trim() || `Track ${i + 1}`;

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
        volume: row?.volume ?? 1,
        customized: row !== undefined,
        instrumentCustomized: row?.instrument != null,
      };
    });
  }, [score.tracks, score.notes, overrides, instrumentIndex]);
}

/**
 * Whether the Tracks section has anything to show: a song is open and it carries
 * at least one track. Drives the `Sonata.Section` `useAvailable` gate so the card
 * (title + chrome) renders nothing for closed / trackless states — replacing the
 * panel's old `return null`. Safe to call alongside the panel body:
 * `useTrackMixerEntries` is a memoized live-state/context read, not expensive per
 * call, so invoking it in both the gate and the body costs nothing extra.
 */
export function useTrackMixerAvailable(): boolean {
  const { currentSongId } = useSonata();
  const entries = useTrackMixerEntries();
  return currentSongId != null && entries.length > 0;
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

/**
 * Fader position per trackId, as a linear gain multiplier (1 = unity, 0 =
 * silent, 2 = +6 dB) — consumed by the audio engine to set each track's fader
 * gain. Every track in the score appears, unity included, so the engine can
 * read a channel's level without having to know whether a row was persisted.
 * Muted tracks are NOT filtered out here: mute is a separate mechanism applied
 * upstream (see `useMutedTrackIds`), and a muted track keeps whatever fader
 * position it will return to when unmuted.
 */
export function useTrackVolumeMap(): Map<string, number> {
  const entries = useTrackMixerEntries();
  return useMemo(
    () => new Map(entries.map((e) => [e.trackId, e.volume])),
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

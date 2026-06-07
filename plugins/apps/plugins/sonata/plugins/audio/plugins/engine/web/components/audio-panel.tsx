import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sonata,
  useSonata,
  type InstrumentVoices,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useMutedTrackIds } from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { startScheduling, type ScheduleHandle } from "../scheduler";

const DEFAULT_VOLUME = 0.8;

/**
 * The cohesive "Audio" panel — a `Sonata.Section` (`area: "player"`) that owns
 * the Web Audio graph and the scheduling effect. On each `isPlaying → true`
 * transition it captures one anchor (`ctx.currentTime` + the cursor beat) and
 * hands it to `startScheduling`, which schedules notes against the Web Audio
 * clock in a bounded look-ahead window (re-arming itself via audio-clock events,
 * never a JS timer / polling) so playback start stays cheap regardless of Score
 * size. Because both the visual rAF cursor and this schedule anchor at the same
 * play instant and derive time from `beatToSeconds`, sound stays locked to the
 * cursor through tempo changes.
 */
export function AudioPanel() {
  const { score, isPlaying, cursorBeat, seekEpoch, registerClock } = useSonata();

  // Muted tracks are dropped from the play-list before scheduling. Deriving a
  // filtered score (rather than passing the set down) keeps `startScheduling`
  // track-agnostic; its identity changes when the mute set changes, so the
  // scheduling effect re-runs and the schedule reflects the new mute state.
  const mutedIds = useMutedTrackIds();
  const audibleScore = useMemo(
    () =>
      mutedIds.size === 0
        ? score
        : { ...score, notes: score.notes.filter((n) => !mutedIds.has(n.track)) },
    [score, mutedIds],
  );

  // Keep the latest cursor in a ref so the scheduling effect reads it WITHOUT
  // depending on it (re-anchor only on play/stop, like the transport).
  const cursorBeatRef = useRef(cursorBeat);
  cursorBeatRef.current = cursorBeat;

  // Instruments are read generically — never names the piano (collection clean).
  const instruments = Sonata.Instrument.useContributions();
  const [activeInstrumentId, setActiveInstrumentId] = useState<string | null>(
    null,
  );
  // Default to the first contributed instrument once contributions arrive.
  const effectiveInstrumentId = activeInstrumentId ?? instruments[0]?.id ?? null;
  const activeInstrument = instruments.find(
    (i) => i.id === effectiveInstrumentId,
  );

  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Web Audio graph: AudioContext + master gain, owned in refs. ----------
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<InstrumentVoices | null>(null);
  const [voices, setVoices] = useState<InstrumentVoices | null>(null);

  // Create the context eagerly on mount; it starts suspended until a gesture.
  useEffect(() => {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = DEFAULT_VOLUME;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;

    // Register the AudioContext clock as the transport's authoritative time
    // source, so the visual cursor reads the *same* clock the audio is
    // scheduled against (no drift, correct across tab backgrounding). Stable for
    // the whole session: `ctx.currentTime` is frozen while suspended and only
    // advances after `ctx.resume()` on play — exactly when the cursor reads it.
    const unregisterClock = registerClock({ now: () => ctx.currentTime });

    // Belt-and-suspenders autoplay-gate unlock: the play button is itself a
    // gesture, but a one-time pointerdown resume covers any other entry point.
    const unlock = () => {
      void ctx.resume();
    };
    document.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      unregisterClock();
      document.removeEventListener("pointerdown", unlock);
      // Guard against React StrictMode's double invoke: only close once.
      if (ctx.state !== "closed") {
        void ctx.close();
      }
      ctxRef.current = null;
      masterRef.current = null;
    };
    // `registerClock` is stable (memoized in the provider), so this effect still
    // runs once: create the AudioContext + register its clock on mount.
  }, [registerClock]);

  // Master gain follows the volume slider live.
  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = volume;
  }, [volume]);

  // --- Voices: (re)build whenever ctx + active instrument are ready. --------
  useEffect(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master || !activeInstrument) return;

    setReady(false);
    setLoadError(null);
    const next = activeInstrument.createVoices(ctx, master);
    voicesRef.current = next;
    setVoices(next);

    let cancelled = false;
    // Surface a rejected load instead of spinning "Loading…" forever (and
    // leaving the rejection floating). Note: smplr resolves `loaded` even when
    // individual samples 404 — the loud signal for the offline-uncached case is
    // server-side (the asset-mirror 502 + log), not this rejection arm.
    void next.loaded.then(
      () => {
        if (!cancelled) setReady(true);
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      },
    );

    return () => {
      cancelled = true;
      next.dispose();
      if (voicesRef.current === next) voicesRef.current = null;
    };
  }, [activeInstrument]);

  // --- Scheduling effect: anchor on play, schedule upfront, allOff on stop. --
  // Re-runs on `seekEpoch` too: a seek repositions the playback origin without
  // changing `score`, so we must cancel the in-flight schedule and re-anchor
  // from the new cursor — otherwise audio keeps playing from the pre-seek spot.
  // It also re-runs when `audibleScore` changes (tempo, edits, or a mute toggle),
  // re-scheduling from the current cursor so muting/unmuting takes effect live.
  useEffect(() => {
    if (!voices) return;

    if (!isPlaying) {
      voices.allOff();
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume();

    // Capture the shared anchor synchronously at the play instant.
    const audioAnchor = ctx.currentTime;
    const fromBeat = cursorBeatRef.current;

    let handle: ScheduleHandle | null = null;
    let cancelled = false;
    void (async () => {
      await voices.loaded;
      if (cancelled) return;
      handle = startScheduling(audibleScore, fromBeat, audioAnchor, voices, ctx);
    })();

    return () => {
      cancelled = true;
      handle?.cancel();
      voices.allOff();
    };
  }, [isPlaying, audibleScore, activeInstrumentId, voices, seekEpoch]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Audio
      </div>

      {/* Instrument picker — generic over the contribution shape. */}
      <div className="mt-3">
        {instruments.length === 0 ? (
          <span className="text-xs text-muted-foreground">No instruments</span>
        ) : (
          <SegmentedControl
            options={instruments.map((inst) => ({
              id: inst.id,
              label: inst.label,
              icon: inst.icon ? <inst.icon className="size-3.5" /> : undefined,
            }))}
            value={effectiveInstrumentId ?? ""}
            onChange={setActiveInstrumentId}
          />
        )}
      </div>

      {/* Master volume. */}
      <label className="mt-4 block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Volume
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-1 w-full accent-primary"
        />
      </label>

      {/* Sample-load status line. */}
      <div
        className={cn(
          "mt-3 text-xs",
          loadError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {activeInstrument
          ? loadError
            ? `Failed to load: ${loadError}`
            : ready
              ? "Ready"
              : "Loading instrument…"
          : "No instrument selected"}
      </div>
    </div>
  );
}

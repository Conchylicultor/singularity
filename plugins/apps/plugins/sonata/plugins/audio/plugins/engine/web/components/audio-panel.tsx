import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sonata,
  useSonata,
  type InstrumentVoices,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
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
  const { score, isPlaying, cursorBeat } = useSonata();

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

    // Belt-and-suspenders autoplay-gate unlock: the play button is itself a
    // gesture, but a one-time pointerdown resume covers any other entry point.
    const unlock = () => {
      void ctx.resume();
    };
    document.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      // Guard against React StrictMode's double invoke: only close once.
      if (ctx.state !== "closed") {
        void ctx.close();
      }
      ctxRef.current = null;
      masterRef.current = null;
    };
  }, []);

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
    const next = activeInstrument.createVoices(ctx, master);
    voicesRef.current = next;
    setVoices(next);

    let cancelled = false;
    void next.loaded.then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      next.dispose();
      if (voicesRef.current === next) voicesRef.current = null;
    };
  }, [activeInstrument]);

  // --- Scheduling effect: anchor on play, schedule upfront, allOff on stop. --
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
      handle = startScheduling(score, fromBeat, audioAnchor, voices, ctx);
    })();

    return () => {
      cancelled = true;
      handle?.cancel();
      voices.allOff();
    };
  }, [isPlaying, score, activeInstrumentId, voices]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Audio
      </div>

      {/* Instrument picker — generic over the contribution shape. */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {instruments.length === 0 ? (
          <span className="text-xs text-muted-foreground">No instruments</span>
        ) : (
          instruments.map((inst) => {
            const Icon = inst.icon;
            const active = inst.id === effectiveInstrumentId;
            return (
              <button
                key={inst.id}
                type="button"
                onClick={() => setActiveInstrumentId(inst.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
                )}
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                {inst.label}
              </button>
            );
          })
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
      <div className="mt-3 text-xs text-muted-foreground">
        {activeInstrument
          ? ready
            ? "Ready"
            : "Loading instrument…"
          : "No instrument selected"}
      </div>
    </div>
  );
}

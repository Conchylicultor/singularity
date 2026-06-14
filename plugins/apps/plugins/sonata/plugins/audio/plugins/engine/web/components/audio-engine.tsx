import { useEffect, useMemo, useRef } from "react";
import {
  Sonata,
  useCursorApi,
  useSonata,
  type InstrumentVoices,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  useMutedTrackIds,
  useTrackInstrumentMap,
} from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { startScheduling, type ScheduleHandle } from "../scheduler";
import { DEFAULT_VOLUME, useAudioControls, useAudioState } from "../audio-store";

/**
 * The headless Sonata audio engine — a `Sonata.Effect`, mounted once inside
 * `SonataProvider` (in `SonataLayout`) and therefore **always mounted while the
 * Sonata app is open**, independent of which pane is active or whether the
 * player's section column is collapsed. It owns the Web Audio graph
 * (`AudioContext` + master gain), the per-instrument voice managers, and the
 * scheduling effect; it renders nothing.
 *
 * Previously this lived inside `AudioPanel` (a collapsible `Sonata.Section`), so
 * collapsing the panel unmounted the component and `ctx.close()`'d the
 * `AudioContext` mid-playback — killing all sound. Splitting the graph into this
 * always-mounted effect makes panel visibility purely cosmetic; the slider and
 * status line now talk to the engine through the per-surface `audio-store`
 * (provided above both via the `Sonata.SurfaceProvider` wrapper slot).
 *
 * On each `isPlaying → true` transition it captures one anchor (`ctx.currentTime`
 * + the cursor beat) and hands it to `startScheduling`, which schedules notes
 * against the Web Audio clock in a bounded look-ahead window (re-arming itself
 * via audio-clock events, never a JS timer / polling) so playback start stays
 * cheap regardless of Score size. Because both the visual rAF cursor and this
 * schedule anchor at the same play instant and derive time from `beatToSeconds`,
 * sound stays locked to the cursor through tempo changes.
 *
 * Instruments are PER-TRACK: there is no global picker here (instrument
 * selection lives in the Tracks panel). The engine maintains one voice manager
 * per *distinct in-use* instrument id — shared by every track resolving to that
 * instrument — and routes each note to its track's manager. The set of in-use
 * instruments derives live from `useTrackInstrumentMap()` + the audible score,
 * so changing a track's instrument mid-session loads the new timbre and the
 * scheduling effect re-runs to play it.
 */
export function AudioEngine() {
  const { score, isPlaying, seekEpoch, registerClock } = useSonata();

  // Imperative per-surface cursor facade. Read through a ref inside the
  // scheduling effect so the effect's deps stay unchanged (the cursor is read
  // straight at the play instant, NOT a render input — see below). `cursor` is
  // stable (memoized on the store), so the ref simply mirrors it.
  const cursor = useCursorApi();
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

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

  // Resolved trackId → instrumentId (override ?? GM-program match ?? default),
  // live-state backed: it changes when someone picks a new instrument for a
  // track, which flows into the in-use set and the scheduling effect below.
  const trackInstrumentMap = useTrackInstrumentMap();

  // Instruments are read generically — never names a contributor (collection
  // clean). A by-id map lets us look up a contribution's `createVoices`.
  const instruments = Sonata.Instrument.useContributions();
  const instrumentById = useMemo(
    () => new Map(instruments.map((inst) => [inst.id, inst] as const)),
    [instruments],
  );

  // The DISTINCT instrument ids actually in use: resolve every track that still
  // has audible notes. A track whose notes are all muted contributes nothing
  // (so its manager is torn down). Sorted + joined into a stable key so the
  // reconcile effect fires only when the *set* of in-use ids changes — not on
  // every render and not when an unrelated track's note tally shifts.
  const inUseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of audibleScore.notes) {
      const id = trackInstrumentMap.get(n.track);
      if (id) ids.add(id);
    }
    return ids;
  }, [audibleScore, trackInstrumentMap]);
  const inUseKey = useMemo(() => [...inUseIds].sort().join("|"), [inUseIds]);

  // Master volume is owned by the shared store (the panel slider writes it).
  const { volume } = useAudioState();
  // Imperative writers for the engine's health slice. Memoized-stable on the
  // store handle, so listing it in effect deps below doesn't re-run effects.
  const { setStatus, setLoadError } = useAudioControls();

  // --- Web Audio graph: AudioContext + master gain, owned in refs. ----------
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  // One voice manager per distinct in-use instrument id, shared across every
  // track that resolves to it (safe: muted tracks are already filtered out
  // upstream, so a shared manager never sounds a muted track).
  const managersRef = useRef<Map<string, InstrumentVoices>>(new Map());

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

    const managers = managersRef.current;
    return () => {
      unregisterClock();
      document.removeEventListener("pointerdown", unlock);
      // Dispose every voice manager before tearing down the context.
      for (const manager of managers.values()) manager.dispose();
      managers.clear();
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

  // --- Manager reconcile: one InstrumentVoices per distinct in-use id. ------
  // Keyed on `inUseKey` (the stable set fingerprint) so it fires only when the
  // in-use *set* changes: create managers for newly-needed ids, dispose ones no
  // longer in use. Aggregate load errors loudly (mirror the prior per-instrument
  // `loaded.then(ok, err)` pattern). This effect is declared BEFORE the
  // scheduling/status effects, so on any render where the in-use set changes it
  // mutates the ref first — the later effects then read the up-to-date managers
  // without needing a separate version signal.
  useEffect(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    const managers = managersRef.current;
    let changed = false;
    let cancelled = false;

    // Add newly-needed instruments.
    for (const id of inUseIds) {
      if (managers.has(id)) continue;
      const contribution = instrumentById.get(id);
      if (!contribution) continue; // no registered contribution for this id
      const next = contribution.createVoices(ctx, master);
      managers.set(id, next);
      changed = true;
      // Surface a rejected load instead of spinning "Loading…" forever (and
      // leaving the rejection floating).
      void next.loaded.then(
        () => {},
        (err: unknown) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        },
      );
    }

    // Remove instruments no longer in use.
    for (const [id, manager] of managers) {
      if (inUseIds.has(id)) continue;
      manager.dispose();
      managers.delete(id);
      changed = true;
    }

    if (changed) setLoadError(null);

    return () => {
      cancelled = true;
    };
    // `inUseKey` is the stable fingerprint of `inUseIds`; `instrumentById` only
    // changes when contributions change. `setLoadError` is memoized-stable. All
    // intentional deps.
  }, [inUseKey, inUseIds, instrumentById, setLoadError]);

  // --- Scheduling effect: anchor on play, schedule upfront, allOff on stop. --
  // Re-runs on `seekEpoch` too: a seek repositions the playback origin without
  // changing `score`, so we must cancel the in-flight schedule and re-anchor
  // from the new cursor — otherwise audio keeps playing from the pre-seek spot.
  // It also re-runs when `audibleScore` changes (tempo, edits, or a mute toggle)
  // or when `trackInstrumentMap` changes (a track's instrument changed) —
  // re-scheduling from the current cursor so the new timbre takes effect live.
  // Both inputs also drive `inUseIds`/the reconcile effect, which runs first and
  // has the managers ready in the ref by the time this effect reads them.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const managers = [...managersRef.current.values()];

    if (!isPlaying) {
      for (const manager of managers) manager.allOff();
      return;
    }

    void ctx.resume();

    // Capture the shared anchor synchronously at the play instant. The cursor is
    // read straight from the store (it's not a render input here) — a seek bumps
    // `seekEpoch`, re-running this effect so the read reflects the new position.
    const audioAnchor = ctx.currentTime;
    const fromBeat = cursorRef.current.getBeat();

    // Route a track to its instrument's manager, reading the ref live so it
    // always reflects the latest reconcile.
    const resolveVoices = (trackId: string): InstrumentVoices | undefined =>
      managersRef.current.get(trackInstrumentMap.get(trackId) ?? "");

    let handle: ScheduleHandle | null = null;
    let cancelled = false;
    void (async () => {
      await Promise.all(managers.map((m) => m.loaded));
      if (cancelled) return;
      handle = startScheduling(
        audibleScore,
        fromBeat,
        audioAnchor,
        resolveVoices,
        ctx,
      );
    })();

    return () => {
      cancelled = true;
      handle?.cancel();
      for (const manager of managers) manager.allOff();
    };
  }, [isPlaying, audibleScore, trackInstrumentMap, seekEpoch]);

  // Aggregate status: "Loading…" until every in-use manager is loaded, the
  // error if any failed, "Ready" otherwise. Keyed on `inUseKey` so it
  // re-evaluates whenever the in-use set changes (the reconcile effect, declared
  // earlier, has already updated the ref by then). Published to the store as the
  // engine's health slice (no UI surface reads it yet).
  useEffect(() => {
    const managers = [...managersRef.current.values()];
    if (managers.length === 0) {
      setStatus("empty");
      return;
    }
    setStatus("loading");
    let cancelled = false;
    void Promise.all(managers.map((m) => m.loaded)).then(
      () => {
        if (!cancelled) setStatus("ready");
      },
      () => {
        // The load error is surfaced by the reconcile effect; leave status at
        // "loading" so the error line (not "Ready") shows.
      },
    );
    return () => {
      cancelled = true;
    };
    // `setStatus` is memoized-stable, so adding it doesn't change when this
    // re-evaluates (still on every in-use-set change via `inUseKey`).
  }, [inUseKey, setStatus]);

  return null;
}

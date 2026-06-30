import { SplendidGrandPiano } from "smplr";
import { assetMirrorUrl } from "@plugins/infra/plugins/asset-mirror/core";
import type {
  InstrumentVoices,
  ScheduledNote,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PIANO_MIRROR_ID } from "../shared/mirror";

/**
 * Wrap smplr's `SplendidGrandPiano` (high-quality sampled acoustic grand) into
 * the Sonata `InstrumentVoices` contract.
 *
 * Samples are served same-origin via the asset-mirror primitive: smplr fetches
 * `<mirror>/<sample>.<format>`, the server lazily downloads each file from the
 * CDN on first request, caches it under `~/.singularity/`, and serves it from
 * disk thereafter. So the piano needs network exactly once (first online play),
 * then sounds fully offline — the browser never talks to the external CDN.
 * smplr's loader picks the format per browser (ogg on Chromium/Firefox, m4a on
 * Safari) and the mirror fetches whatever is requested, so all browsers work.
 *
 * Caveat: smplr swallows per-sample fetch failures (it `console.warn`s and skips
 * a non-200 sample rather than rejecting `ready`). So an offline-and-never-warmed
 * piano resolves `ready` but is silent; the loud failure signal is the mirror's
 * server-side 502 + log, not a client exception.
 *
 * smplr@0.26 API used here (verified against `smplr/dist/index.d.ts`):
 *  - factory `SplendidGrandPiano(ctx, { destination, baseUrl })` — callable
 *    without `new`; `destination` routes output into the provided AudioNode;
 *    `baseUrl` overrides the default sample CDN.
 *  - `piano.ready: Promise<void>` resolves when sample loading settles (`.load`
 *    is deprecated).
 *  - `piano.start({ note, velocity, time, duration })` — `note` accepts a MIDI
 *    number; `time`/`duration` are AudioContext seconds. Internally this routes
 *    through smplr's own Scheduler: notes whose `time` is beyond smplr's short
 *    lookahead window sit in a queue and are dispatched to the audio graph later.
 *  - `piano.stop()` (no target) stops only voices ALREADY dispatched to the
 *    audio graph. It does NOT clear smplr's internal scheduler queue — notes we
 *    pre-scheduled but smplr hasn't dispatched yet keep firing. Use
 *    `piano.scheduler.stop()` to flush that queue (see allOff).
 *  - `piano.dispose()` stops all voices and disposes the output channel.
 */
export function createVoices(
  ctx: AudioContext,
  destination: AudioNode,
): InstrumentVoices {
  const piano = SplendidGrandPiano(ctx, {
    destination,
    // Same-origin mirror instead of smplr's default CDN. smplr appends
    // `/<sample>.<format>` and URL-encodes it, so the mirror receives a
    // well-formed path; `formats` is left at smplr's default ["ogg","m4a"].
    baseUrl: assetMirrorUrl(PIANO_MIRROR_ID),
  });

  // After dispose() the smplr instance throws on any stop/start ("Cannot stop
  // voices on a disposed Smplr instance"). The panel drives this voice from two
  // independent effects whose cleanups run in mount order — dispose (voices
  // effect) before allOff (scheduling effect) — so allOff is *expected* to land
  // on an already-disposed instance on unmount and instrument-switch. Make the
  // contract robust to that ordering: once disposed, all voice methods are safe
  // no-ops (there are no voices left to stop or notes worth scheduling).
  let disposed = false;

  return {
    loaded: piano.ready,
    schedule({ pitch, velocity, when, duration }: ScheduledNote): void {
      if (disposed) return;
      piano.start({ note: pitch, velocity, time: when, duration });
    },
    play(pitch: number, velocity: number): () => void {
      if (disposed) return () => {};
      const stop = piano.start({ note: pitch, velocity });
      return () => {
        if (!disposed) stop();
      };
    },
    allOff(): void {
      if (disposed) return;
      // Two layers must be silenced: piano.stop() halts voices already on the
      // audio graph, and piano.scheduler.stop() flushes notes still queued in
      // smplr's internal lookahead (the engine pre-schedules ~1.5s ahead, so
      // without this they'd keep firing for up to a second after pause — the
      // "huge latency"). The next schedule() call re-arms smplr's poll loop, so
      // resume is unaffected; the scheduler is private to this instrument.
      piano.stop();
      piano.scheduler.stop();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      piano.dispose();
    },
  };
}

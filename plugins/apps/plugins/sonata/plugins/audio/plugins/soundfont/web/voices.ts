import { assetMirrorUrl } from "@plugins/infra/plugins/asset-mirror/core";
import type {
  InstrumentVoices,
  ScheduledNote,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SOUNDFONT_MIRROR_ID } from "../shared/mirror";

/**
 * Wrap one smplr `Soundfont` instrument (a single General MIDI patch, identified
 * by its gleitz file slug) into the Sonata `InstrumentVoices` contract.
 *
 * smplr@0.26 API used here (verified against `smplr/dist/index.d.ts`):
 *  - factory `Soundfont(ctx, { destination, instrumentUrl })` — callable without
 *    `new` (an `InstrumentFactory`, like `SplendidGrandPiano`). `instrumentUrl`
 *    is a FULL url to one `<gleitz>-<format>.js` soundfont file (when set, smplr
 *    ignores `kit`/`instrument`); `destination` routes output into the AudioNode.
 *  - `sf.ready: Promise<void>` resolves when sample loading settles (`.load` is
 *    the deprecated alias).
 *  - `sf.start({ note, velocity, time, duration })` — `note` a MIDI number;
 *    `time`/`duration` are AudioContext seconds (identical to the piano).
 *  - `sf.stop()` stops voices already dispatched to the audio graph;
 *    `sf.scheduler.stop()` flushes smplr's internal lookahead queue (the same
 *    two-layer silencing the piano needs — `Soundfont` shares smplr's scheduler).
 *  - `sf.dispose()` stops all voices, disposes the output channel, and stops the
 *    scheduler (`disconnect()` is the deprecated alias).
 *
 * Samples are served same-origin via the asset-mirror primitive: we point smplr's
 * `instrumentUrl` at `/api/asset-mirror/gm-soundfont/<gleitz>-mp3.js`; the server
 * lazily downloads that file from the gleitz soundfont CDN on first request,
 * caches it under `~/.singularity/`, and serves it from disk thereafter. So each
 * timbre needs network exactly once (first online play), then sounds fully offline
 * — the browser never talks to the external CDN. Format is fixed to `mp3` (the
 * gleitz CDN's universally-supported encoding), so there is no per-browser format
 * negotiation. The mirror route requires a flat file name, which `<gleitz>-mp3.js`
 * is (the kit directory is baked into `SOUNDFONT_REMOTE_BASE`).
 *
 * Caveat (mirrors the piano): smplr swallows per-sample fetch failures, so an
 * offline-and-never-warmed instrument resolves `load` but is silent; the loud
 * failure signal is the mirror's server-side 502 + log, not a client exception.
 */
/** smplr's `Soundfont` instance type, taken from the dynamically imported
 *  module so the module is only reached in type position (erased). */
type Sf = ReturnType<(typeof import("smplr"))["Soundfont"]>;

export function createSoundfontVoices(
  ctx: AudioContext,
  destination: AudioNode,
  gleitzName: string,
): InstrumentVoices {
  // `smplr` is imported DYNAMICALLY here (inside the factory body) rather than
  // as a top-level static import, so the sample-engine library is code-split OFF
  // the eager plugin-boot wave: this plugin registers 127 Instrument
  // contributions, but the factory (and thus the chunk) only runs when one of
  // those timbres is first put in use. The synchronous `InstrumentVoices`
  // contract is preserved — the instance is created behind the `loaded` promise
  // every consumer already awaits, and the voice methods are safe no-ops until
  // it settles.
  let sf: Sf | null = null;

  // After teardown the smplr instance throws on any stop/start. The panel drives
  // this voice from two independent effects whose cleanups run in mount order —
  // dispose (voices effect) before allOff (scheduling effect) — so allOff is
  // *expected* to land on an already-disposed instance on unmount and instrument
  // switch. Make the contract robust to that ordering: once disposed, all voice
  // methods are safe no-ops (there are no voices left to stop or notes worth
  // scheduling). Identical semantics to the piano wrapper's `disposed` guard.
  // The same guard also covers the pre-load window (`sf` still null): a method
  // called before the smplr chunk resolves has no instance to act on yet.
  let disposed = false;

  const loaded = import("smplr").then(({ Soundfont }) => {
    // Disposed before the chunk landed (fast unmount / instrument-switch): skip
    // instantiation entirely — there is nothing to sound or tear down.
    if (disposed) return;
    sf = Soundfont(ctx, {
      destination,
      // Full same-origin URL to this patch's gleitz file. `<base>` already pins
      // the kit directory, so the only trailing segment is the flat
      // `<gleitz>-mp3.js` name the mirror route accepts.
      instrumentUrl: `${assetMirrorUrl(SOUNDFONT_MIRROR_ID)}/${gleitzName}-mp3.js`,
    });
    return sf.ready;
  });

  return {
    loaded,
    schedule({ pitch, velocity, when, duration }: ScheduledNote): void {
      if (disposed || !sf) return;
      sf.start({ note: pitch, velocity, time: when, duration });
    },
    play(pitch: number, velocity: number): () => void {
      if (disposed || !sf) return () => {};
      const stop = sf.start({ note: pitch, velocity });
      return () => {
        if (!disposed) stop();
      };
    },
    allOff(): void {
      if (disposed || !sf) return;
      // Two layers must be silenced: sf.stop() halts voices already on the audio
      // graph, and sf.scheduler.stop() flushes notes still queued in smplr's
      // internal lookahead (the engine pre-schedules ~1.5s ahead, so without this
      // they'd keep firing for up to a second after pause). The next schedule()
      // call re-arms smplr's poll loop, so resume is unaffected; the scheduler is
      // private to this instrument.
      sf.stop();
      sf.scheduler.stop();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      sf?.dispose();
    },
  };
}

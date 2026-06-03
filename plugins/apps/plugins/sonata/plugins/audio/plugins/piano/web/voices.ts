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
 *    number; `time`/`duration` are AudioContext seconds.
 *  - `piano.stop()` (no target) stops every sounding/scheduled note.
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

  return {
    loaded: piano.ready,
    schedule({ pitch, velocity, when, duration }: ScheduledNote): void {
      piano.start({ note: pitch, velocity, time: when, duration });
    },
    allOff(): void {
      piano.stop();
    },
    dispose(): void {
      piano.dispose();
    },
  };
}

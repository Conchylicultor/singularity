import { SplendidGrandPiano } from "smplr";
import type {
  InstrumentVoices,
  ScheduledNote,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Wrap smplr's `SplendidGrandPiano` (high-quality sampled acoustic grand) into
 * the Sonata `InstrumentVoices` contract.
 *
 * Samples stream from smplr's default remote storage (CDN), so the piano needs
 * network at runtime; offline it will not sound. Acceptable for the MVP —
 * self-hosting samples is a follow-up.
 *
 * smplr@0.26 API used here (verified against `smplr/dist/index.d.ts`):
 *  - factory `SplendidGrandPiano(ctx, { destination })` — callable without `new`;
 *    `destination` routes the instrument output into the provided AudioNode.
 *  - `piano.ready: Promise<void>` resolves when samples are ready (`.load` is
 *    deprecated).
 *  - `piano.start({ note, velocity, time, duration })` — `note` accepts a MIDI
 *    number; `time`/`duration` are AudioContext seconds.
 *  - `piano.stop()` (no target) stops every sounding/scheduled note.
 *  - `piano.dispose()` stops all voices and disposes the output channel.
 */
export function createVoices(
  ctx: AudioContext,
  destination: AudioNode,
): InstrumentVoices {
  const piano = SplendidGrandPiano(ctx, { destination });

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

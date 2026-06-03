import { beatToSeconds, type Score } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { InstrumentVoices } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Schedule every note that is not fully in the past against the Web Audio clock.
 * `audioAnchor` is `ctx.currentTime` captured at the play instant; `fromBeat` is
 * the cursor beat at that same instant. Each note's beat-onset is mapped to an
 * absolute audio time so Web Audio's own scheduler fires it sample-accurately —
 * no JS timer. Reuses `beatToSeconds` so audio shares the cursor's tempo map.
 */
export function scheduleNotes(
  score: Score,
  fromBeat: number,
  audioAnchor: number,
  voices: InstrumentVoices,
): void {
  const t0 = beatToSeconds(score, fromBeat);
  for (const n of score.notes) {
    if (n.start + n.duration <= fromBeat) continue; // fully in the past
    const startSec = beatToSeconds(score, n.start);
    const when = audioAnchor + startSec - t0;
    const duration = beatToSeconds(score, n.start + n.duration) - startSec;
    voices.schedule({ pitch: n.pitch, velocity: n.velocity, when, duration });
  }
}

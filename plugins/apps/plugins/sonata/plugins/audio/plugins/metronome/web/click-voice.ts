import type { InstrumentVoices } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ACCENT_PITCH, SUB_PITCH } from "./constants";

// Click timbre constants, one triplet per accent tier. An accent (bar downbeat)
// is a higher, fuller blip; a normal beat is lower and quieter so the downbeat
// stands out; a subdivision click (the extra ticks between beats) is higher but
// much quieter — a light tick that fills in the pulse without competing with the
// main beat. A click is a short percussive transient: a near-instant attack then
// an exponential decay to silence in ~50ms, so successive clicks never overlap.
const ACCENT_FREQ_HZ = 1900;
const NORMAL_FREQ_HZ = 1100;
const SUB_FREQ_HZ = 1500;
const ACCENT_LEVEL = 1;
const NORMAL_LEVEL = 0.7;
const SUB_LEVEL = 0.32;
const ATTACK_SEC = 0.001;
const DECAY_SEC = 0.05;
const STOP_SEC = 0.06;
// Exponential ramps can't reach 0 (and can't start from 0), so the envelope
// floats between this epsilon and the peak level.
const SILENCE = 0.0001;

/**
 * A synthesized metronome click voice, shaped as an {@link InstrumentVoices} so
 * it drops straight into the engine's `startScheduling` (continuous track) and
 * the count-in scheduler — both call `schedule({ pitch, velocity, when })`.
 *
 * Each click is a throwaway `OscillatorNode → GainNode` pair: there is nothing
 * to keep alive between clicks (they're <60ms), so `allOff`/`dispose` are no-ops
 * — a stop/seek simply stops scheduling new clicks; any already-scheduled one is
 * far too short to be worth cancelling.
 *
 * `destination` is the caller's sink — wired to `ctx.destination` directly (NOT
 * the music master gain) so muting the song keeps the click audible. `getVolume`
 * is read LIVE on every click so the volume slider takes effect immediately,
 * without rebuilding the voice.
 */
export function createClickVoices(
  ctx: AudioContext,
  destination: AudioNode,
  getVolume: () => number,
): InstrumentVoices {
  return {
    loaded: Promise.resolve(),
    schedule({ pitch, when }) {
      // Three tiers: accent (downbeat) > normal (main beat) > sub (subdivision).
      const accent = pitch >= ACCENT_PITCH;
      const sub = pitch <= SUB_PITCH;
      const volume = Math.max(0, Math.min(1, getVolume()));
      const tierLevel = accent ? ACCENT_LEVEL : sub ? SUB_LEVEL : NORMAL_LEVEL;
      const level = tierLevel * volume;
      if (level <= 0) return; // muted — nothing to sound.

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = accent
        ? ACCENT_FREQ_HZ
        : sub
          ? SUB_FREQ_HZ
          : NORMAL_FREQ_HZ;

      // Percussive envelope: snap up to `level`, then exponential-decay to silence.
      gain.gain.setValueAtTime(SILENCE, when);
      gain.gain.exponentialRampToValueAtTime(level, when + ATTACK_SEC);
      gain.gain.exponentialRampToValueAtTime(SILENCE, when + DECAY_SEC);

      osc.connect(gain).connect(destination);
      osc.start(when);
      osc.stop(when + STOP_SEC);
    },
    allOff() {
      // No-op: a click is a fire-and-forget <60ms transient with no sustain, so
      // there is never anything ringing long enough to cancel on stop/seek.
    },
    dispose() {
      // No-op: per-click nodes own no shared resources (no buffers/samples).
    },
  };
}

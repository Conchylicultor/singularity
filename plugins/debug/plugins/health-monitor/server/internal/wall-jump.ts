// Machine-sleep detection at the source (shared by the process and host
// samplers). A tick that fires more than SLEEP_JUMP_FACTOR × its cadence after
// the previous one spanned a suspend: its loop-lag histogram / rate deltas
// describe the sleep, not the workload, so the sample is stamped with the gap
// and the polluted instruments are neutralized before reading (see
// research/2026-07-11-global-observability-freeze-blind-spots.md, Stage 6).
//
// The factor trades off against the other producer of late ticks — a wedged
// event loop, where the late tick IS the signal and must NOT be erased. A
// block has to exceed 5 × cadence (50 s at the 10 s cadence) continuously to
// misclassify; observed freezes tick tens of seconds late (kept as stall
// evidence) while sleeps gap by hundreds to thousands of seconds.
export const SLEEP_JUMP_FACTOR = 5;

/**
 * The wall-clock jump to stamp on a sample, or undefined for an on-time /
 * merely-late tick. `prevTickMs` is the previous tick's wall time.
 */
export function detectWallJumpMs(
  nowMs: number,
  prevTickMs: number,
  cadenceMs: number,
): number | undefined {
  const gapMs = nowMs - prevTickMs;
  return gapMs > SLEEP_JUMP_FACTOR * cadenceMs ? gapMs : undefined;
}

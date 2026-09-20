import { dlopen } from "bun:ffi";

// <time.h> clock ids on darwin. CLOCK_MONOTONIC_RAW is mach_continuous_time: it
// keeps running while the machine sleeps. CLOCK_UPTIME_RAW is mach_absolute_time:
// it pauses. Both are raw (no NTP slewing), so over any window
//   Δcontinuous − Δawake = time asleep in that window, exactly.
const CLOCK_MONOTONIC_RAW = 4;
const CLOCK_UPTIME_RAW = 8;

export type SleepReading =
  /** Milliseconds the machine was asleep since the previous read (0 on the first). */
  | { supported: true; sleptMs: number }
  /** This platform offers no such pair of clocks here — NOT "it did not sleep". */
  | { supported: false };

export interface SleepMeter {
  /** Sleep since the previous `read()` on this meter. Synchronous, ~1 µs. */
  read(): SleepReading;
}

// libSystem's clock_gettime_nsec_np, dlopen'd LAZILY on first use — the same two
// reasons as packages/flock: no dlopen cost at module eval, and the module stays
// importable where FFI is not.
let clockNs: ((id: number) => bigint) | null = null;

function readNs(id: number): bigint {
  if (clockNs === null) {
    const { symbols } = dlopen("libSystem.B.dylib", {
      clock_gettime_nsec_np: { args: ["i32"], returns: "u64" },
    });
    clockNs = symbols.clock_gettime_nsec_np as unknown as (
      id: number,
    ) => bigint;
  }
  return BigInt(clockNs(id));
}

/**
 * A meter of machine sleep between successive reads.
 *
 * Why it exists: a laptop that naps for 5–17 s at a time (maintenance sleep on
 * battery) looks, to every timer-based instrument, exactly like a process that
 * froze for 5–17 s. On 2026-09-20 two unrelated backends filed identical
 * "event-loop stall" reports for the same naps. A wall-clock gap heuristic cannot
 * separate the two without also erasing real freezes; the OS can, because it keeps
 * one clock that pauses during sleep and one that does not.
 *
 * darwin only. Elsewhere `read()` answers `{ supported: false }` — a caller must
 * not read that as "no sleep".
 */
export function createSleepMeter(): SleepMeter {
  if (process.platform !== "darwin") {
    return { read: () => ({ supported: false }) };
  }
  let lastContinuous = readNs(CLOCK_MONOTONIC_RAW);
  let lastAwake = readNs(CLOCK_UPTIME_RAW);
  return {
    read(): SleepReading {
      const continuous = readNs(CLOCK_MONOTONIC_RAW);
      const awake = readNs(CLOCK_UPTIME_RAW);
      const sleptNs = continuous - lastContinuous - (awake - lastAwake);
      lastContinuous = continuous;
      lastAwake = awake;
      // The two clocks are read a few hundred nanoseconds apart, so an awake
      // window can come out a hair negative.
      return {
        supported: true,
        sleptMs: sleptNs > 0n ? Number(sleptNs) / 1e6 : 0,
      };
    },
  };
}

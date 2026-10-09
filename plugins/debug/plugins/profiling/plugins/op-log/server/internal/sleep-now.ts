import type { SleepNow } from "@plugins/infra/plugins/host/plugins/machine-sleep/core";
import { readSleepClock } from "@plugins/packages/plugins/sleep-clock/core";

/**
 * The machine's sleep clock now, as the fold's `sleepNow` — `null` where the
 * platform cannot tell. For the server-side readers (the CLI's file fold and
 * the orphan reconciler), which can read the clock directly; the browser gets
 * the same value pushed through `machine-sleep`.
 */
export function readSleepNow(): SleepNow {
  const r = readSleepClock();
  return r.supported
    ? { boot: r.boot, asleepMs: r.asleepMs, wakeAtMs: r.wakeAtMs }
    : null;
}

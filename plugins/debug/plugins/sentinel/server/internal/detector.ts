import type { ClusterSample } from "../../core";

// Pure onset state machine — dual-threshold, dual-dwell hysteresis. Fed one
// sample per sentinel tick; IO-free so trip/clear behavior is bun-testable.
//
// Trip when ANY signal is elevated for `onTicks` consecutive ticks; clear when
// ALL signals sit below the clear thresholds (trip thresholds × offRatio) for
// `offTicks` consecutive ticks. One trip event per episode.

export interface DetectorThresholds {
  onLoadRatio: number;
  onLocksWaiting: number;
  onBlkReadDeltaMs: number;
  onBackendP99Ms: number;
  onSlowBackends: number;
  onTicks: number;
  offRatio: number;
  offTicks: number;
}

/** Signal values at a tick, for the trip trace's detail payload. */
export interface SignalReadings {
  loadRatio: number;
  locksWaiting: number;
  blkReadDeltaMs: number | null;
  slowBackends: number;
}

export type DetectorEvent =
  | { kind: "trip"; runUpMs: number; signals: SignalReadings; elevated: string[] }
  | { kind: "clear" }
  | null;

function signalsAt(
  sample: ClusterSample,
  t: DetectorThresholds,
): { readings: SignalReadings; elevated: string[]; allCalm: boolean } {
  const readings: SignalReadings = {
    loadRatio: sample.cpuCount > 0 ? sample.loadAvg1 / sample.cpuCount : 0,
    locksWaiting: sample.pgLocksWaiting,
    blkReadDeltaMs: sample.pgBlkReadDeltaMs,
    slowBackends: Object.values(sample.backendP99).filter(
      (p99) => p99 > t.onBackendP99Ms,
    ).length,
  };
  const elevated: string[] = [];
  if (readings.loadRatio >= t.onLoadRatio) elevated.push("loadRatio");
  if (readings.locksWaiting >= t.onLocksWaiting) elevated.push("locksWaiting");
  if (readings.blkReadDeltaMs !== null && readings.blkReadDeltaMs >= t.onBlkReadDeltaMs)
    elevated.push("blkReadDeltaMs");
  if (readings.slowBackends >= t.onSlowBackends) elevated.push("slowBackends");

  const off = (v: number) => v * t.offRatio;
  const allCalm =
    readings.loadRatio < off(t.onLoadRatio) &&
    readings.locksWaiting < off(t.onLocksWaiting) &&
    (readings.blkReadDeltaMs === null || readings.blkReadDeltaMs < off(t.onBlkReadDeltaMs)) &&
    readings.slowBackends < off(t.onSlowBackends);

  return { readings, elevated, allCalm };
}

export interface OnsetDetector {
  /** Feed one tick's sample; returns the transition event, if any. */
  feed(sample: ClusterSample, thresholds: DetectorThresholds, cadenceMs: number): DetectorEvent;
  readonly tripped: boolean;
}

export function createOnsetDetector(): OnsetDetector {
  let elevatedTicks = 0;
  let calmTicks = 0;
  let tripped = false;

  return {
    get tripped() {
      return tripped;
    },
    feed(sample, thresholds, cadenceMs): DetectorEvent {
      const { readings, elevated, allCalm } = signalsAt(sample, thresholds);

      if (!tripped) {
        elevatedTicks = elevated.length > 0 ? elevatedTicks + 1 : 0;
        if (elevatedTicks >= thresholds.onTicks) {
          tripped = true;
          calmTicks = 0;
          return {
            kind: "trip",
            runUpMs: elevatedTicks * cadenceMs,
            signals: readings,
            elevated,
          };
        }
        return null;
      }

      calmTicks = allCalm ? calmTicks + 1 : 0;
      if (calmTicks >= thresholds.offTicks) {
        tripped = false;
        elevatedTicks = 0;
        return { kind: "clear" };
      }
      return null;
    },
  };
}

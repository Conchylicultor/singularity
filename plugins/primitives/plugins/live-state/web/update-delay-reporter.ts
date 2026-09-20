import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

export interface UpdateDelayInfo {
  key: string;
  /**
   * Milliseconds from the change on the server to the value being applied in THIS
   * tab's cache: `Date.now()` here minus the `changedAt` the frame carried (the
   * change-feed trigger's `clock_timestamp()`, or the `notify()` call for a
   * resource whose truth is outside Postgres).
   *
   * It starts on a clock the serving thread does not own, which is the point: the
   * server's own delivery latency starts when that thread finally reads the
   * NOTIFY, so a stalled thread hides its own delay. Two wall clocks are compared,
   * so this is only meaningful while browser, backend and Postgres share one
   * machine (one instance per user). Can be slightly negative from clock
   * granularity; the consumer clamps.
   */
  delayMs: number;
  /** The tab was hidden when the frame was applied — timers are throttled there. */
  hidden: boolean;
}

/**
 * One applied update or delta frame that carried a change time. Emitted for every
 * such frame, to every tab with a live subscription for it; live-state owns no
 * threshold. `debug/latency-ledger` registers the handler.
 */
export const updateDelayReportSink = defineReportSink<UpdateDelayInfo>();

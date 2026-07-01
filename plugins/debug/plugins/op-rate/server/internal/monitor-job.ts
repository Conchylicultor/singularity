import { z } from "zod";
import {
  getRuntimeProfile,
  type SpanKind,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import type { ConfigValues } from "@plugins/config_v2/core";
import { recordReport } from "@plugins/reports/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { opRateConfig } from "../../core";

type Thresholds = ConfigValues<(typeof opRateConfig)["fields"]>;

// The window the call-rate delta is measured over. Informational only (matches
// the cron interval): the trip decision is on the raw per-op delta vs the
// per-kind threshold, so cron skew never changes correctness.
const WINDOW_MS = 5 * 60_000;

// The span kinds the runtime profiler tracks, re-derived locally as a const (the
// recorder does not export its KINDS array). Kept in lock-step with
// runtime-profiler's SpanKind union, which IS exported and types the threshold
// helper below.
const KINDS = ["http", "db", "loader", "sub", "push", "flush", "job"] as const;

// Cap on reports filed per tick, so a pathological burst across many ops can
// never storm task creation. Over-threshold ops past the cap are logged (no
// silent truncation, per repo policy).
const TOP_N = 20;

// Per-process baseline of each op's cumulative `count` at the previous tick,
// keyed `${kind}:${label}`. The runtime profiler accumulates `count` cumulatively
// since boot; we diff successive snapshots here so the recorder stays pure (no
// back-edge to a monitor). Lives at module scope: the job and the recorder run in
// the SAME worktree process.
const lastCount = new Map<string, number>();

// Drop-count log for over-cap ops (one line per tick when the cap trips).
const opRateLog = Log.channel("op-rate");

// Cheap scheduled call-rate monitor. Runs every 5 min in EACH worktree's own
// process (perWorktree) because the runtime profiler is per-process in-memory
// state, so call counts accumulate per-backend and must be sampled per-backend.
// `dedup: "singleton"` means the monitor itself can never pile up, and
// `maxAttempts: 3` keeps a transiently-broken monitor from becoming a dead-job
// storm of its own. Reads the profile through getRuntimeProfile() (pull-only, no
// recorder hook) and diffs the cumulative `count` against the previous tick.
// Reports fire only when a per-kind threshold trips (silent when healthy).
export const opRateMonitorJob = defineJob({
  name: "debug.op-rate-monitor",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/5 * * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cfg = getConfig(opRateConfig);
    if (!cfg.enabled) return;

    const { aggregates } = getRuntimeProfile();
    const hot: { kind: SpanKind; label: string; delta: number; threshold: number }[] =
      [];
    for (const kind of KINDS) {
      const threshold = kindThreshold(kind, cfg);
      for (const agg of aggregates[kind]) {
        const key = `${kind}:${agg.label}`;
        const prev = lastCount.get(key);
        lastCount.set(key, agg.count);
        // First observation of a label seeds the baseline and fires nothing —
        // avoids a false spike from the full since-boot count on the first tick.
        if (prev === undefined) continue;
        // Reset-safe: if count regressed (profile was reset, or the label is
        // new this tick), treat the full current count as the window delta.
        const delta = agg.count >= prev ? agg.count - prev : agg.count;
        if (delta > threshold)
          hot.push({ kind, label: agg.label, delta, threshold });
      }
    }

    // Cap at top-N over-threshold ops per tick, ranked by delta desc, to bound
    // task creation. Log (don't silently drop) when more than N trip.
    hot.sort((a, b) => b.delta - a.delta);
    const top = hot.slice(0, TOP_N);
    if (hot.length > top.length) {
      opRateLog.publish(
        `${hot.length - top.length} over-threshold ops not reported (top-${TOP_N} cap)`,
      );
    }

    for (const h of top) {
      await recordReport({
        kind: "op-rate",
        source: "server-op-rate-monitor",
        data: {
          kind: h.kind,
          label: h.label,
          callsInWindow: h.delta,
          windowMs: WINDOW_MS,
          threshold: h.threshold,
        },
        message: `${h.kind} ${h.label} — ${h.delta} calls/window (threshold ${h.threshold})`,
      });
    }
  },
});

// Map each SpanKind to its per-kind threshold field (same shape as slow-ops'
// thresholdFor). Typed over the exported SpanKind so adding a kind is a tsc
// error here until its threshold is wired.
function kindThreshold(kind: SpanKind, cfg: Thresholds): number {
  switch (kind) {
    case "http":
      return cfg.httpPerWindow;
    case "loader":
      return cfg.loaderPerWindow;
    case "sub":
      return cfg.subPerWindow;
    case "push":
      return cfg.pushPerWindow;
    case "flush":
      return cfg.flushPerWindow;
    case "db":
      return cfg.dbPerWindow;
    case "job":
      return cfg.jobPerWindow;
  }
}

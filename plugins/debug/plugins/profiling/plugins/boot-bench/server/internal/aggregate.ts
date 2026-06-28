import type { IterResult, BootBenchRunResponse } from "../../shared/endpoints";

export interface Stat {
  min: number;
  median: number;
  p95: number;
}

// Linear-interpolation percentile (numpy default): for p=50 this is the true
// median (mean of the two middle values on an even count). Caller passes a list
// already validated non-empty.
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const w = rank - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export function min(xs: number[]): number {
  if (xs.length === 0) throw new Error("min of empty array");
  return Math.min(...xs);
}

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error("median of empty array");
  return percentile([...xs].sort((a, b) => a - b), 50);
}

export function p95(xs: number[]): number {
  if (xs.length === 0) throw new Error("p95 of empty array");
  return percentile([...xs].sort((a, b) => a - b), 95);
}

export function stat(xs: number[]): Stat {
  return { min: min(xs), median: median(xs), p95: p95(xs) };
}

export interface ModeAggregate {
  iterations: number;
  bootSnapshotTotalMs: Stat;
  // Per boot-critical key: where the value came from and the (amortized for
  // persisted) work cost across iterations.
  bootSnapshotPerKey: Record<string, { source: string; workMs: Stat }>;
  // Per first-subscribe target: aggregated latency, or null when the fixture was
  // missing so the target was skipped every iteration.
  firstSubscribe: Record<
    string,
    { loaderMs: Stat; onFirstSubscribeMs: Stat } | null
  >;
  eventLoopMaxMs: Stat;
}

export function aggregateMode(iters: IterResult[]): ModeAggregate {
  if (iters.length === 0) throw new Error("aggregateMode: empty iteration set");

  const perKeyKeys = new Set<string>();
  for (const it of iters) {
    for (const k of Object.keys(it.bootSnapshot.perKey)) perKeyKeys.add(k);
  }
  const bootSnapshotPerKey: ModeAggregate["bootSnapshotPerKey"] = {};
  for (const k of perKeyKeys) {
    const vals: number[] = [];
    const sources = new Set<string>();
    for (const it of iters) {
      const e = it.bootSnapshot.perKey[k];
      if (e) {
        vals.push(e.workMs);
        sources.add(e.source);
      }
    }
    bootSnapshotPerKey[k] = {
      source: sources.size === 1 ? [...sources][0]! : "mixed",
      workMs: stat(vals),
    };
  }

  const fsKeys = new Set<string>();
  for (const it of iters) {
    for (const k of Object.keys(it.firstSubscribe)) fsKeys.add(k);
  }
  const firstSubscribe: ModeAggregate["firstSubscribe"] = {};
  for (const k of fsKeys) {
    const loaderMs: number[] = [];
    const onFirstSubscribeMs: number[] = [];
    for (const it of iters) {
      const e = it.firstSubscribe[k];
      if (e) {
        loaderMs.push(e.loaderMs);
        onFirstSubscribeMs.push(e.onFirstSubscribeMs);
      }
    }
    firstSubscribe[k] =
      loaderMs.length > 0
        ? { loaderMs: stat(loaderMs), onFirstSubscribeMs: stat(onFirstSubscribeMs) }
        : null;
  }

  return {
    iterations: iters.length,
    bootSnapshotTotalMs: stat(iters.map((it) => it.bootSnapshot.totalMs)),
    bootSnapshotPerKey,
    firstSubscribe,
    eventLoopMaxMs: stat(iters.map((it) => it.eventLoop.maxMs)),
  };
}

export interface BootBenchReport {
  fixtures: BootBenchRunResponse["fixtures"];
  scope: string;
  modes: { cold?: ModeAggregate; warm?: ModeAggregate };
}

export function buildReport(res: BootBenchRunResponse): BootBenchReport {
  return {
    fixtures: res.fixtures,
    scope:
      "live-server cold: clears the L2 persisted snapshot (no restart); excludes server-boot work (catch-up, derived-table rebuild, pool warm)",
    modes: {
      cold: res.runs.cold ? aggregateMode(res.runs.cold) : undefined,
      warm: res.runs.warm ? aggregateMode(res.runs.warm) : undefined,
    },
  };
}

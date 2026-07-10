import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cpus, loadavg } from "node:os";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { getContentionSnapshot } from "@plugins/infra/plugins/contention/server";
import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { WORKTREES_DIR } from "@plugins/infra/plugins/paths/server";
import {
  HealthSampleSchema,
  type HealthSample,
} from "@plugins/debug/plugins/health-monitor/server";
import {
  Log,
  readChannelEntries,
  type LogChannel,
} from "@plugins/primitives/plugins/log-channels/server";
import { sentinelConfig } from "../../core";
import type { ClusterSample } from "../../core";
import { clusterClass } from "./cluster-class";
import {
  countBuildProcesses,
  counterDelta,
  mapPgStatsRow,
  type PgStatsRow,
} from "./sample-math";

// The cluster congestion sentinel — main-only, always-on.
//
// Why a setInterval and NOT a defineJob / graphile cron task: the sentinel is
// the diagnostic instrument FOR cluster duress. Routing it through the job
// queue (which runs on an event loop and a DB that the congestion it measures
// saturates) would mean the onset it exists to observe silently starves it.
// graphile cron's 1-minute floor is also far too coarse for a ~5s cadence.
// Mirrors health-monitor/server/internal/process-sampler.ts (the recorded
// exception to the no-polling rule).

const GATEWAY_WORKTREES_URL = "http://localhost:9000/gateway/worktrees";
/** Health rollup (a disk scan) runs every Nth tick; other ticks reuse it. */
const ROLLUP_EVERY_N_TICKS = 3;
/** A health.jsonl untouched for this long belongs to a stopped backend. */
const ROLLUP_STALE_MS = 60_000;

interface GatewayWorktree {
  name: string;
  state: string;
  activeConns: number;
}

let interval: ReturnType<typeof setInterval> | null = null;
let channel: LogChannel | null = null;
let tickCount = 0;
let prevBlkReadTimeMs: number | null = null;
let prevXactCommit: number | null = null;
let lastRollup: Record<string, number> = {};

// B4's onset detector subscribes here (same plugin, module-internal registry) —
// it consumes exactly the samples the ring records, so trip decisions and
// persisted evidence can never diverge.
type SampleListener = (sample: ClusterSample) => void;
const listeners = new Set<SampleListener>();
export function onSentinelSample(listener: SampleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// One batched round trip: these views are cluster-global, so main's own pool
// sees the whole embedded cluster. wait_event_type IS NULL rows (running on
// CPU) are excluded — the record carries genuine wait states only.
const PG_STATS_SQL = sql`SELECT
  (SELECT count(*) FROM pg_locks WHERE NOT granted) AS locks_waiting,
  (SELECT sum(blk_read_time) FROM pg_stat_database) AS blk_read_time,
  (SELECT sum(xact_commit) FROM pg_stat_database) AS xact_commit,
  (SELECT json_object_agg(wait_event_type, n)
     FROM (SELECT wait_event_type, count(*)::int AS n
             FROM pg_stat_activity
            WHERE state = 'active' AND wait_event_type IS NOT NULL
            GROUP BY 1) w) AS wait_events`;

async function readFleetFromGateway(): Promise<{
  runningBackends: number;
  totalActiveConns: number;
} | null> {
  try {
    const res = await fetch(GATEWAY_WORKTREES_URL, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`gateway responded ${res.status}`);
    const list = (await res.json()) as GatewayWorktree[];
    const running = list.filter((w) => w.state === "running");
    return {
      runningBackends: running.length,
      totalActiveConns: running.reduce((sum, w) => sum + w.activeConns, 0),
    };
  // eslint-disable-next-line promise-safety/no-absorbed-failure -- null IS the discriminated "fleet unreadable this tick" state: the sample schema marks the fleet fields nullable, the failure is logged to the sentinel channel, and losing the tick's pg/host vitals to a gateway hiccup would be worse than a null fleet reading
  } catch (err) {
    channel?.publish(`gateway fleet read failed: ${String(err)}`);
    return null;
  }
}

async function countBuilds(): Promise<number | null> {
  try {
    // One `ps` spawn per tick — the host-sampler's vm_stat-per-tick precedent.
    // captureProcessTree() is (pid, ppid) only; fleet counting needs commands.
    const proc = Bun.spawn(["ps", "-axo", "command="], { stdout: "pipe" });
    const text = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    if (exit !== 0) throw new Error(`ps exited ${exit}`);
    return countBuildProcesses(text);
  // eslint-disable-next-line promise-safety/no-absorbed-failure -- null IS the discriminated "scan unreadable this tick" state: inFlightBuilds is nullable in the sample schema and the failure is logged to the sentinel channel; a ps hiccup must not lose the tick's pg/host vitals
  } catch (err) {
    channel?.publish(`build-process scan failed: ${String(err)}`);
    return null;
  }
}

// Latest event-loop p99 per live backend, from each worktree's health.jsonl
// tail line — the health-monitor disk-scan idiom, restricted to files with a
// fresh mtime so stopped backends drop out of the rollup.
function readBackendP99Rollup(): Record<string, number> {
  const rollup: Record<string, number> = {};
  let names: string[];
  try {
    names = readdirSync(WORKTREES_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return rollup;
    throw err;
  }
  const now = Date.now();
  for (const name of names) {
    const file = join(WORKTREES_DIR, name, "logs", "health.jsonl");
    try {
      if (now - statSync(file).mtimeMs > ROLLUP_STALE_MS) continue;
    } catch (err) {
      // No health file — not a running backend. Anything else is a real error.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue;
    }
    const entries = readChannelEntries(name, "health", 1);
    const line = entries?.at(-1)?.line;
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      // Torn tail write — the next rollup gets a whole line.
      if (!(err instanceof SyntaxError)) throw err;
      continue;
    }
    const sample = HealthSampleSchema.safeParse(parsed);
    if (!sample.success) continue;
    rollup[name] = (sample.data as HealthSample).eventLoopP99Ms;
  }
  return rollup;
}

async function tick(): Promise<void> {
  tickCount++;
  const [loadAvg1 = 0, loadAvg5 = 0] = loadavg();

  const contention = await getContentionSnapshot();
  const pgRow = (await db.execute(PG_STATS_SQL)).rows[0] as unknown as PgStatsRow;
  const pg = mapPgStatsRow(pgRow);
  const blkDelta = counterDelta(prevBlkReadTimeMs, pg.blkReadTimeMs);
  const xactDelta = counterDelta(prevXactCommit, pg.xactCommit);
  prevBlkReadTimeMs = pg.blkReadTimeMs;
  prevXactCommit = pg.xactCommit;

  const [fleet, builds] = await Promise.all([readFleetFromGateway(), countBuilds()]);
  if (tickCount % ROLLUP_EVERY_N_TICKS === 1) lastRollup = readBackendP99Rollup();

  const sample: ClusterSample = {
    wall: Date.now(),
    loadAvg1,
    loadAvg5,
    cpuCount: cpus().length,
    pgActiveBackends: contention.pgActiveBackends,
    pgTotalBackends: contention.pgTotalBackends,
    pgWaitEvents: pg.waitEvents,
    pgLocksWaiting: pg.locksWaiting,
    pgBlkReadDeltaMs: blkDelta,
    pgXactCommitDelta: xactDelta,
    runningBackends: fleet?.runningBackends ?? null,
    totalActiveConns: fleet?.totalActiveConns ?? null,
    inFlightBuilds: builds,
    backendP99: lastRollup,
  };

  clusterClass.emit({ tMs: performance.now(), data: sample });
  for (const listener of listeners) listener(sample);
}

export function startSentinelSampler(): void {
  if (interval) return;
  const cfg = getConfig(sentinelConfig);
  if (!cfg.enabled) return;
  channel = Log.channel("sentinel", { persist: true });
  // Cadence is read once — the interval is created at boot; changing it takes
  // a backend restart (the config field says so).
  interval = setInterval(() => {
    void runInBackgroundLane(() =>
      runWithoutProfiling(() =>
        tick().catch((err) => {
          // A failing tick must not kill the interval, but it is never silent.
          channel?.publish(`tick failed: ${String(err)}`);
        }),
      ),
    );
  }, cfg.cadenceMs);
}

export function stopSentinelSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  listeners.clear();
}

import { statSync } from "node:fs";
import { join } from "node:path";
import { cpus, loadavg } from "node:os";
import {
  listWorktreeDirs,
  MAIN_WORKTREE_NAME,
  WORKTREES_DIR,
} from "@plugins/infra/plugins/paths/server";
import {
  HealthSampleSchema,
  HostSampleSchema,
  type HealthSample,
} from "@plugins/debug/plugins/health-monitor/server";
import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import type { ClusterSample } from "../../../core";
import { counterDelta, countBuildProcesses, mapPgStatsRow } from "../sample-math";
import type { SentinelPg } from "./pg";

// The impure per-tick gatherers, moved verbatim out of the old main-loop
// sampler (sampler.ts) into the sentinel worker. Per-signal degradation is
// preserved: every sub-read fails into null fields plus a log line, never the
// whole tick — the sample schema marks the corresponding fields nullable.

const GATEWAY_WORKTREES_URL = "http://localhost:9000/gateway/worktrees";
/** Health rollup (a disk scan) runs every Nth tick; other ticks reuse it. */
const ROLLUP_EVERY_N_TICKS = 3;
/** A health.jsonl untouched for this long belongs to a stopped backend. */
const ROLLUP_STALE_MS = 60_000;
/**
 * A health-host.jsonl line older than this is stale (3× the host sampler's
 * 10s cadence) — the compressor fields read null rather than a frozen value
 * (research/2026-07-11-global-fleet-memory-admission-duress-valve.md, D6).
 */
const HOST_SAMPLE_FRESH_MS = 30_000;

interface GatewayWorktree {
  name: string;
  state: string;
  activeConns: number;
}

type Logger = (line: string) => void;

async function readFleetFromGateway(log: Logger): Promise<{
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
    log(`gateway fleet read failed: ${String(err)}`);
    return null;
  }
}

async function countBuilds(log: Logger): Promise<number | null> {
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
    log(`build-process scan failed: ${String(err)}`);
    return null;
  }
}

// Latest event-loop p99 per live backend, from each worktree's health.jsonl
// tail line — the health-monitor disk-scan idiom, restricted to files with a
// fresh mtime so stopped backends drop out of the rollup.
export function readBackendP99Rollup(): Record<string, number> {
  const rollup: Record<string, number> = {};
  const names = listWorktreeDirs();
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

export interface HostCompressorReading {
  decompressionsPerSec: number | null;
  compressorMb: number | null;
  freeMemMb: number | null;
}

const NULL_HOST_READING: HostCompressorReading = {
  decompressionsPerSec: null,
  compressorMb: null,
  freeMemMb: null,
};

/**
 * Tail-read the host sampler's latest health-host.jsonl line — the memory
 * signal (compressor thrash) the detector consumes. Same tail-line idiom as
 * the p99 rollup, on ONE file per tick. `worktree` is explicit because the
 * host data is host-global, written by the main backend only — callers pass
 * MAIN_WORKTREE_NAME (tests point it at a throwaway worktree).
 */
export function readHostCompressor(worktree: string): HostCompressorReading {
  const entries = readChannelEntries(worktree, "health-host", 1);
  const line = entries?.at(-1)?.line;
  if (!line) return NULL_HOST_READING;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    // Torn tail write — the next tick gets a whole line.
    if (!(err instanceof SyntaxError)) throw err;
    return NULL_HOST_READING;
  }
  const sample = HostSampleSchema.safeParse(parsed);
  if (!sample.success) return NULL_HOST_READING;
  if (Date.now() - sample.data.sampledAt > HOST_SAMPLE_FRESH_MS) {
    return NULL_HOST_READING;
  }
  // A wallJumpMs-stamped tick spans a machine suspend — "no measurement this
  // window" by the host-sampler contract, so it must not feed the detector.
  if (sample.data.wallJumpMs !== undefined) return NULL_HOST_READING;
  return {
    decompressionsPerSec: sample.data.decompressionsPerSec ?? null,
    compressorMb: sample.data.compressorMb ?? null,
    freeMemMb: sample.data.freeMemMb,
  };
}

export interface SampleGatherer {
  gather(): Promise<ClusterSample>;
}

/**
 * Binds the per-tick gather to its cross-tick state (pg counter baselines,
 * the cached rollup) — the module-level state of the old sampler, moved into
 * a closure so a respawned worker starts clean by construction.
 */
export function createSampleGatherer(pg: SentinelPg, log: Logger): SampleGatherer {
  let tickCount = 0;
  let prevBlkReadTimeMs: number | null = null;
  let prevXactCommit: number | null = null;
  let lastRollup: Record<string, number> = {};

  return {
    async gather(): Promise<ClusterSample> {
      tickCount++;
      const [loadAvg1 = 0, loadAvg5 = 0] = loadavg();

      const pgRow = await pg.queryStats();
      const pgStats = pgRow === null ? null : mapPgStatsRow(pgRow);
      const blkDelta =
        pgStats === null ? null : counterDelta(prevBlkReadTimeMs, pgStats.blkReadTimeMs);
      const xactDelta =
        pgStats === null ? null : counterDelta(prevXactCommit, pgStats.xactCommit);
      // A failed read resets the baselines: a delta spanning the gap would
      // read as a bogus spike, so the next good tick starts a fresh baseline.
      prevBlkReadTimeMs = pgStats?.blkReadTimeMs ?? null;
      prevXactCommit = pgStats?.xactCommit ?? null;

      const [fleet, builds] = await Promise.all([
        readFleetFromGateway(log),
        countBuilds(log),
      ]);
      if (tickCount % ROLLUP_EVERY_N_TICKS === 1) lastRollup = readBackendP99Rollup();
      const host = readHostCompressor(MAIN_WORKTREE_NAME);

      return {
        wall: Date.now(),
        loadAvg1,
        loadAvg5,
        cpuCount: cpus().length,
        pgActiveBackends: pgStats?.activeBackends ?? null,
        pgTotalBackends: pgStats?.totalBackends ?? null,
        pgWaitEvents: pgStats?.waitEvents ?? null,
        pgLocksWaiting: pgStats?.locksWaiting ?? null,
        pgBlkReadDeltaMs: blkDelta,
        pgXactCommitDelta: xactDelta,
        runningBackends: fleet?.runningBackends ?? null,
        totalActiveConns: fleet?.totalActiveConns ?? null,
        inFlightBuilds: builds,
        backendP99: lastRollup,
        decompressionsPerSec: host.decompressionsPerSec,
        compressorMb: host.compressorMb,
        freeMemMb: host.freeMemMb,
      };
    },
  };
}

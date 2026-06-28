import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  measureSubscribeCycle,
  type ResourceParams,
} from "@plugins/framework/plugins/server-core/core";
import {
  assembleBootSnapshot,
  bootCriticalKeys,
} from "@plugins/infra/plugins/boot-snapshot/server";
import { clearPersistedSnapshots } from "@plugins/database/plugins/live-state-snapshot/server";
import {
  getRuntimeProfile,
  resetRuntimeProfile,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { bootBenchRun, type IterResult } from "../../shared/endpoints";
import { resolveFixtures } from "./fixtures";
import { resetEldProbe, readEldProbe } from "./eld-probe";

const DEFAULT_ITERATIONS = 10;
const DEFAULT_WARMUP = 2;

// commits-graph's onLastUnsubscribe evicts its per-worktree git memo via a
// DETACHED promise (`void worktreeFor(id).then(evict)`), so the memo is not
// guaranteed clear when measureSubscribeCycle returns. This fixed one-shot settle
// gives that eviction time to land before the next (cold) iteration reads a warm
// memo. Known footgun — a follow-up makes onLastUnsubscribe awaitable so this is
// no longer needed; do NOT replace it with a polling loop.
const SETTLE_MS = 150;

// How many top loaders (by average duration) to surface per iteration.
const TOP_LOADERS = 8;

export const handleBootBenchRun = implement(bootBenchRun, async ({ body }) => {
  const iterations = body.iterations ?? DEFAULT_ITERATIONS;
  const warmup = body.warmup ?? DEFAULT_WARMUP;
  const mode = body.mode ?? "both";

  const fixtures = await resolveFixtures(body);

  // Fixed first-subscribe target set. A null fixture id means the target is
  // skipped (reported null in the result) rather than crashing the run.
  const targetSpecs: [key: string, params: ResourceParams | null][] = [
    ["edited-files", fixtures.conversationId ? { id: fixtures.conversationId } : null],
    ["commits-graph.delta", fixtures.attemptId ? { attemptId: fixtures.attemptId } : null],
    ["commits-graph.graph", fixtures.attemptId ? { attemptId: fixtures.attemptId } : null],
  ];
  const liveTargets = targetSpecs.filter(
    (t): t is [string, ResourceParams] => t[1] !== null,
  );
  const skippedKeys = targetSpecs.filter((t) => t[1] === null).map((t) => t[0]);

  async function runIteration(cold: boolean): Promise<IterResult> {
    if (cold) await clearPersistedSnapshots(bootCriticalKeys());

    // Open clean measurement windows immediately before the burst.
    resetEldProbe();
    resetRuntimeProfile();

    // Reproduce the boot burst: ONE Promise.all over DISTINCT keys (distinct
    // inflight slots → real concurrent loader contention; same-key concurrency
    // would wrongly collapse via single-flight).
    const [snap, ...subs] = await Promise.all([
      (async () => {
        const t = performance.now();
        const r = await assembleBootSnapshot();
        return { totalMs: performance.now() - t, perKey: r.timings };
      })(),
      ...liveTargets.map(([key, params]) =>
        measureSubscribeCycle(key, params).then(
          (v): [string, { onFirstSubscribeMs: number; loaderMs: number }] => [key, v],
        ),
      ),
    ]);

    const eventLoop = readEldProbe();
    const profile = getRuntimeProfile();

    const firstSubscribe: IterResult["firstSubscribe"] = {};
    for (const key of skippedKeys) firstSubscribe[key] = null;
    for (const [key, v] of subs) firstSubscribe[key] = v;

    const topLoaders = profile.aggregates.loader
      .map((agg) => ({
        label: agg.label,
        avgMs: agg.totalMs / agg.count,
        maxMs: agg.maxMs,
        count: agg.count,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, TOP_LOADERS);

    return {
      bootSnapshot: { totalMs: snap.totalMs, perKey: snap.perKey },
      firstSubscribe,
      eventLoop,
      runtimeProfile: { topLoaders },
    };
  }

  async function runSet(cold: boolean, count: number): Promise<IterResult[]> {
    const out: IterResult[] = [];
    for (let i = 0; i < count; i++) {
      out.push(await runIteration(cold));
      // Bounded settle so detached teardown (commits-graph eviction) lands before
      // the next iteration. One-shot, never a polling loop.
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    }
    return out;
  }

  // WARM iterations run BEFORE any cold-clear (the snapshot is naturally warm on a
  // running backend). Discard the first `warmup` of each set to absorb GC.
  const warm =
    mode === "cold" ? undefined : (await runSet(false, warmup + iterations)).slice(warmup);
  const cold =
    mode === "warm" ? undefined : (await runSet(true, warmup + iterations)).slice(warmup);

  return { fixtures, runs: { cold, warm } };
});

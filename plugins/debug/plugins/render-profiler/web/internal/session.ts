import { useSyncExternalStore } from "react";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import {
  RENDER_PROFILER_CHANNEL,
  type HookChange,
  type InitiatorStat,
  type ProfilerReport,
  type ProfilerStartOptions,
} from "../../core";
import type { FiberRoot } from "./react-types";
import { collectInitiators, getComponentName } from "./fiber-walk";
import { classifyHookChanges } from "./hook-classify";
import { isExcludedFiber } from "./global-api";

const DEFAULT_MAX_DURATION_MS = 30_000;
/** Cap the recompute/notify cadence to ~4×/s — NOT a polling loop. */
const FLUSH_INTERVAL_MS = 250;

// ---- Module-level session state -------------------------------------------

const stats = new Map<string, InitiatorStat>();
let totalCommits = 0;
let startedAtMs: number | null = null;
let running = false;
let maxDurationMs = DEFAULT_MAX_DURATION_MS;
let bridgeMissing = false;
let autoStopHandle: ReturnType<typeof setTimeout> | null = null;
let lastFlushMs = 0;

// External-store wiring: a stable cached snapshot so useSyncExternalStore never
// loops; we only replace the cached object on flush.
const subscribers = new Set<() => void>();
// eslint-disable-next-line scoped-store/no-module-mutable-store -- intentionally page-global: a profiling session observes the single React fiber root + the single window.__REACT_DEVTOOLS_GLOBAL_HOOK__ commit stream for the whole page; per-surface scoping would fragment one global commit stream and is semantically wrong.
let cachedReport: ProfilerReport = emptyReport();

function emptyReport(): ProfilerReport {
  return {
    running: false,
    startedAtMs: null,
    durationMs: 0,
    totalCommits: 0,
    commitsPerSec: 0,
    initiators: [],
  };
}

function signatureFor(
  componentName: string,
  ancestorPath: string[],
  changedHooks: HookChange[],
): string {
  return (
    ancestorPath.join(">") +
    "|" +
    componentName +
    "|" +
    changedHooks.map((h) => h.kind + "#" + h.index).join(",")
  );
}

/**
 * Elapsed session time used as the denominator for /s rates. Floored at 1s so
 * the first sub-second commit doesn't divide by ~0 and report an absurd spike
 * (e.g. "714/s"); within the first second a rate reads as the raw count, then
 * becomes exact. Not used for the displayed duration, which stays precise.
 */
function elapsedSecondsForRate(): number {
  if (startedAtMs == null) return 1;
  return Math.max(1, (performance.now() - startedAtMs) / 1000);
}

function computeReport(): ProfilerReport {
  const secs = elapsedSecondsForRate();
  const initiators = Array.from(stats.values())
    .map((s): InitiatorStat => ({
      ...s,
      // Rate over the whole session elapsed time (stable; a per-initiator
      // first→last window oscillates wildly for bursty initiators).
      ratePerSec: s.commitCount / secs,
    }))
    .sort((a, b) => b.commitCount - a.commitCount);

  return {
    running,
    startedAtMs,
    durationMs: startedAtMs == null ? 0 : performance.now() - startedAtMs,
    totalCommits,
    commitsPerSec: totalCommits / secs,
    initiators,
    bridgeMissing: bridgeMissing || undefined,
  };
}

function flush(): void {
  cachedReport = computeReport();
  subscribers.forEach((cb) => cb());
}

function maybeFlush(): void {
  const now = performance.now();
  if (now - lastFlushMs >= FLUSH_INTERVAL_MS) {
    lastFlushMs = now;
    flush();
  }
}

interface CommitInitiator {
  componentName: string;
  ancestorPath: string[];
  changedHooks: HookChange[];
}

function onCommit(root: FiberRoot): void {
  if (!running) return;
  // One commit per onCommit call — the headline "commits/s" rate.
  totalCommits += 1;

  // Dedupe by signature WITHIN this commit: a repeated list row (e.g. 180
  // SortableItem fibers) shares one signature and must count as ONE commit for
  // that initiator (not 180), or commitCount would exceed totalCommits and the
  // per-initiator rate would be meaningless. We keep the per-commit fiber count
  // as `instanceCount` — a separate, useful signal.
  const perCommit = new Map<string, CommitInitiator & { instances: number }>();
  for (const { fiber, ancestorPath } of collectInitiators(root)) {
    if (isExcludedFiber(fiber)) continue;
    const componentName = getComponentName(fiber);
    const changedHooks = classifyHookChanges(fiber).filter((h) => h.changed);
    const signature = signatureFor(componentName, ancestorPath, changedHooks);
    const seen = perCommit.get(signature);
    if (seen) {
      seen.instances += 1;
    } else {
      perCommit.set(signature, {
        componentName,
        ancestorPath,
        changedHooks,
        instances: 1,
      });
    }
  }

  const now = performance.now();
  for (const [signature, info] of perCommit) {
    const existing = stats.get(signature);
    if (existing) {
      existing.commitCount += 1;
      existing.instanceCount = info.instances;
      existing.lastSeenMs = now;
      existing.changedHooks = info.changedHooks;
      existing.ancestorPath = info.ancestorPath;
    } else {
      stats.set(signature, {
        signature,
        componentName: info.componentName,
        ancestorPath: info.ancestorPath,
        commitCount: 1,
        instanceCount: info.instances,
        ratePerSec: 0,
        firstSeenMs: now,
        lastSeenMs: now,
        changedHooks: info.changedHooks,
      });
    }
  }
  maybeFlush();
}

function bridgeSubscribers(): Set<(root: FiberRoot) => void> | undefined {
  return window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.__commitSubscribers;
}

export function startSession(opts?: ProfilerStartOptions): void {
  if (running) return;
  stats.clear();
  totalCommits = 0;
  bridgeMissing = false;
  maxDurationMs = opts?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  startedAtMs = performance.now();
  lastFlushMs = 0;
  running = true;

  const subs = bridgeSubscribers();
  if (subs) {
    subs.add(onCommit);
  } else {
    // The passive bridge in index.html was not installed (frontend not rebuilt).
    bridgeMissing = true;
  }

  // One-shot session cap. This is an upper bound, NOT an interval-based polling
  // loop (the no-polling rule forbids interval change-checking, not a timed cap).
  if (autoStopHandle) clearTimeout(autoStopHandle);
  autoStopHandle = setTimeout(stopSession, maxDurationMs);

  flush();
}

export function stopSession(): void {
  if (!running) {
    return;
  }
  const subs = bridgeSubscribers();
  subs?.delete(onCommit);
  if (autoStopHandle) {
    clearTimeout(autoStopHandle);
    autoStopHandle = null;
  }
  running = false;
  flush();

  // Dump the final ranked report to the per-worktree JSONL so headless/agent
  // runs can read root-cause without the UI. clientLog is fire-and-forget (void).
  clientLog(
    RENDER_PROFILER_CHANNEL,
    JSON.stringify({ type: "report", ...cachedReport }),
  );
}

export function getReport(): ProfilerReport {
  // Recompute on demand so an imperative getReport() reflects the latest stats
  // even between throttled flushes; keep the cache in sync.
  cachedReport = computeReport();
  return cachedReport;
}

export function isRunning(): boolean {
  return running;
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): ProfilerReport {
  return cachedReport;
}

/** React hook the pane uses to re-render on each throttled flush. */
export function useProfilerReport(): ProfilerReport {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

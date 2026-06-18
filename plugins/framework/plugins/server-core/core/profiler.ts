export type PhaseId =
  | "register"
  | "awaitPgReady"
  | "runMigrations"
  | "routePopulation"
  | "socketBind"
  | "onReadyBlocking"
  | "onReady"
  | "onAllReady";

export interface Span {
  id: string;
  phase: PhaseId;
  plugin?: string;
  label: string;
  startMs: number;
  durationMs: number;
  /** RSS (MB) at span start. Cheap snapshot of process.memoryUsage().rss. */
  rssStartMb?: number;
  /** RSS (MB) at span end. */
  rssEndMb?: number;
}

/**
 * A phase-boundary memory snapshot. Unlike per-span RSS deltas (which overlap
 * for plugins running under Promise.all in onReadyBlocking/onReady and are only
 * directional), these boundary checkpoints are the authoritative numbers.
 */
export interface MemoryCheckpoint {
  label: string;
  atMs: number;
  rssMb: number;
  heapUsedMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

const bootStart = performance.now();
const spans: Span[] = [];
const idCounts = new Map<string, number>();
const memoryCheckpoints: MemoryCheckpoint[] = [];

/** bytes → MB, rounded to 1 decimal. */
function toMb(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

export function profilerStart(
  id: string,
  phase: PhaseId,
  label: string,
  plugin?: string,
): () => void {
  const count = idCounts.get(id) ?? 0;
  idCounts.set(id, count + 1);
  const uniqueId = count === 0 ? id : `${id}:${count}`;
  const t0 = performance.now();
  const rssStartMb = toMb(process.memoryUsage().rss);
  return () => {
    spans.push({
      id: uniqueId,
      phase,
      plugin,
      label,
      startMs: Math.round(t0 - bootStart),
      durationMs: Math.round(performance.now() - t0),
      rssStartMb,
      rssEndMb: toMb(process.memoryUsage().rss),
    });
  };
}

/**
 * Record a process-wide memory snapshot at a clean boot-phase boundary.
 * These boundary checkpoints are the authoritative per-phase RSS numbers
 * (per-span deltas inside parallel phases overlap and are only directional).
 */
export function recordMemoryCheckpoint(label: string): void {
  const mem = process.memoryUsage();
  memoryCheckpoints.push({
    label,
    atMs: Math.round(performance.now() - bootStart),
    rssMb: toMb(mem.rss),
    heapUsedMb: toMb(mem.heapUsed),
    externalMb: toMb(mem.external),
    arrayBuffersMb: toMb(mem.arrayBuffers),
  });
}

export function getProfilingData(): {
  spans: Span[];
  totalDurationMs: number;
  memoryCheckpoints: MemoryCheckpoint[];
} {
  const totalDurationMs =
    spans.length === 0
      ? 0
      : Math.max(...spans.map((s) => s.startMs + s.durationMs));
  return { spans, totalDurationMs, memoryCheckpoints };
}

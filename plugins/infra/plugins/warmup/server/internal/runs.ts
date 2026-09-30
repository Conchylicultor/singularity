import type { WarmupRun } from "./executor";

// This process's warm-up runs, by name — the drain runs once per boot, so the
// latest run IS the run. Bounded by the declared set.
const runs = new Map<string, WarmupRun>();
const listeners = new Set<(name: string) => void>();

/** Record a run (called by the drain). */
export function recordWarmupRun(name: string, run: WarmupRun): void {
  runs.set(name, run);
  for (const l of listeners) l(name);
}

/** The warm-up's run in this process, or `undefined` when the drain has not
 * reached it (yet). */
export function warmupRunOf(name: string): WarmupRun | undefined {
  return runs.get(name);
}

/** Be told when a warm-up starts, settles or is skipped. For the life of the
 * process; returns the unsubscribe. */
export function onWarmupRun(listener: (name: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

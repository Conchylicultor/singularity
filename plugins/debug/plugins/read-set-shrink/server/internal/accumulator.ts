import type { ReadSetShrinkEvent } from "@plugins/database/plugins/live-state-snapshot/server";

// Module-level, in-process buffer of pending read-set shrink events. PURE MEMORY
// (like live-state-churn's accumulator). `persistSnapshot` (via onReadSetShrink)
// hands off a shed synchronously; the scheduled monitor job drains and files
// reports — recordReport inside a job `run` is throw-safe/retried, unlike the sync
// persist path, which is why the hand-off is buffered rather than filed inline.
// Keyed by resourceKey so a resource that sheds more than once before the next
// tick collapses to its LATEST event (the durable set has already converged, so
// the latest is authoritative). Bounded by the boot-critical resource count; the
// cap is a defensive backstop that is never reached in practice.
const MAX_KEYS = 512;
const pending = new Map<string, ReadSetShrinkEvent>();

export function recordShrink(e: ReadSetShrinkEvent): void {
  if (!pending.has(e.resourceKey) && pending.size >= MAX_KEYS) return;
  pending.set(e.resourceKey, e);
}

// Drain ALL pending events (clears the buffer). Called each monitor tick.
export function drainShrinks(): ReadSetShrinkEvent[] {
  const out = [...pending.values()];
  pending.clear();
  return out;
}

export function _resetForTest(): void {
  pending.clear();
}

// In-process trace admission: a per-trigger cooldown plus a global per-minute
// token bucket, checked BEFORE any capture work — so a slow-event storm costs
// one Map lookup per trip, never a serialization. This is the sole home for the
// admission machinery (its former flight-recorder twin has been deleted).

// "kind:label" -> atMs of the last admitted trace for that trigger.
const lastByOp = new Map<string, number>();

// Bound the cooldown map. Labels are bounded in practice (routes, loader names,
// job names), so this is a belt-and-braces guard against a pathological label
// source; the reset only risks one extra trace per trigger.
const MAX_TRACKED_OPS = 2048;

let minuteStart = 0;
let minuteCount = 0;

export function admitTrace(
  key: string,
  atMs: number,
  cooldownMs: number,
  maxPerMin: number,
): boolean {
  if (atMs - minuteStart >= 60_000) {
    minuteStart = atMs;
    minuteCount = 0;
  }
  if (minuteCount >= maxPerMin) return false;

  const last = lastByOp.get(key);
  if (last !== undefined && atMs - last < cooldownMs) return false;

  if (lastByOp.size > MAX_TRACKED_OPS) lastByOp.clear();
  lastByOp.set(key, atMs);
  minuteCount += 1;
  return true;
}

// Test seam: the limiter is module-level mutable state.
export function resetRateLimit(): void {
  lastByOp.clear();
  minuteStart = 0;
  minuteCount = 0;
}

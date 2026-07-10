import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import { BootEventSchema, type BootEvent } from "./schema";

// Lines read per worktree file (newest kept). One line per boot; even a
// deploy-heavy day is tens of boots, so this comfortably covers any realistic
// lookback window.
const MAX_LINES = 1000;

// Each entry is a log-channel envelope ({ t, stream, line }); the boot event
// JSON is in `line`. Mirrors health-monitor's read-health-files.ts.
export function readBootEvents(worktree: string, windowMs: number): BootEvent[] {
  const cutoff = Date.now() - windowMs;
  const entries = readChannelEntries(worktree, "boot", MAX_LINES);
  // No boot.jsonl yet (worktree predates this plugin, or never booted) — a
  // legitimately-empty history, not a failure.
  if (!entries) return [];
  const out: BootEvent[] = [];
  for (const entry of entries) {
    let obj: unknown;
    try {
      obj = JSON.parse(entry.line);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    const parsed = BootEventSchema.safeParse(obj);
    // A boot is the interval [processStartedAt, readyAt]; processStartedAt <=
    // readyAt, so the interval overlaps [cutoff, now] iff readyAt >= cutoff.
    if (parsed.success && parsed.data.readyAt >= cutoff) out.push(parsed.data);
  }
  return out;
}

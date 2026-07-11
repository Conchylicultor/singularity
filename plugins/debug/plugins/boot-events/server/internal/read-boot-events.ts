import { readChannelEntries } from "@plugins/primitives/plugins/log-channels/server";
import { BootLineSchema, type BootEvent, type BootLine } from "./schema";
import { pairBootLines } from "./pair-boot-lines";

// Lines read per worktree file (newest kept). Two lines per boot; even a
// deploy-heavy day is tens of boots, so this comfortably covers any realistic
// lookback window.
const MAX_LINES = 1000;

// Each entry is a log-channel envelope ({ t, stream, line }); the boot line
// JSON is in `line`. Mirrors health-monitor's read-health-files.ts.
export function readBootEvents(worktree: string, windowMs: number): BootEvent[] {
  const cutoff = Date.now() - windowMs;
  const entries = readChannelEntries(worktree, "boot", MAX_LINES);
  // No boot.jsonl yet (worktree predates this plugin, or never booted) — a
  // legitimately-empty history, not a failure.
  if (!entries) return [];
  const lines: BootLine[] = [];
  for (const entry of entries) {
    let obj: unknown;
    try {
      obj = JSON.parse(entry.line);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    const parsed = BootLineSchema.safeParse(obj);
    if (parsed.success) lines.push(parsed.data);
  }
  // A boot's interval starts at processStartedAt and ends at readyAt, at the
  // superseding attempt's start, or (never-ready latest attempt) extends to
  // now — so it overlaps [cutoff, now] iff its end edge is >= cutoff, with an
  // unbounded end always overlapping.
  return pairBootLines(lines).filter(
    (e) => (e.readyAt ?? e.supersededAtMs ?? Number.POSITIVE_INFINITY) >= cutoff,
  );
}

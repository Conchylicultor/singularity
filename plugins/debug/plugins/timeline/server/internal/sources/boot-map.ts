import type { TimelineEvent } from "../../../core";
import { overlapsWindow } from "../window";

// Structural view of a boot-events line — the pure mapping stays testable
// without importing the boot-events reader (and its log-channels chain).
export interface BootEventLike {
  processStartedAt: number; // wall-clock epoch ms
  readyAt: number; // wall-clock epoch ms
}

// A boot is the wall-clock interval [processStartedAt, readyAt] — a
// deploy-restart burst renders as a stack of these bars. `worktree` is the
// log-dir name the events were read from (== the lane), not the line's own
// field, so the chunk and its events can never disagree.
export function mapBootEvents(
  events: readonly BootEventLike[],
  worktree: string,
  fromMs: number,
  toMs: number,
): TimelineEvent[] {
  return events
    .filter((e) => overlapsWindow(e.processStartedAt, e.readyAt, fromMs, toMs))
    .map((e) => ({
      id: `boot:${worktree}:${e.readyAt}`,
      source: "boot" as const,
      worktree,
      startMs: e.processStartedAt,
      endMs: e.readyAt,
      label: "backend boot",
      severity: "info" as const,
      detail: {
        processStartedAt: e.processStartedAt,
        readyAt: e.readyAt,
        bootMs: e.readyAt - e.processStartedAt,
      },
    }));
}

import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The machine watcher's host-global files:
 *
 * - `status.json` — the last supervision status main's sentinel host wrote,
 *   plus its pid. Main writes it on every transition; every backend watches it
 *   to serve the health report's "Machine watcher" row, and the build CLI reads
 *   it at the admission valve.
 * - `vitals.json` — the watcher's latest reading (every signal that can trip
 *   duress with its limit, the trip state, free memory / builds / worktrees),
 *   written by the sentinel worker every tick; every backend watches it to serve
 *   the row's glance and detail.
 *
 * `locks`, beside the duress latch it reports on (`locks/duress`): like the
 * latch, the file describes a live process and means nothing once that process
 * is gone — a reader checks the recorded pid for exactly that reason.
 */
export const sentinelStatusDir = defineDataDir({
  kind: "locks",
  name: "sentinel",
  owner: "debug/sentinel/status-file",
  description:
    "The machine watcher's (cluster sentinel's) status file, written by main on every supervision transition and read by every backend's health report and the build CLI's admission valve; and its vitals file, the latest reading the sentinel worker writes every tick for the health report's Machine watcher stats",
  // Deleting it while main runs would show "no watcher has run" until the next
  // transition (the vitals file comes back on the next tick); once nothing is
  // running it carries nothing.
  reclaim: { kind: "restart" },
});

export default [sentinelStatusDir];

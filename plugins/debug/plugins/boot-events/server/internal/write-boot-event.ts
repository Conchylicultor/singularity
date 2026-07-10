import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import type { BootEvent } from "./schema";

// Writes exactly one persisted log-channel line per boot (the plugin's
// `onReady` hook runs once per process) to
// ~/.singularity/worktrees/<wt>/logs/boot.jsonl.
//
// A log-channel line, not a DB table: no migration, survives DB re-forks, and
// stays readable from the main backend's disk scan even while this backend is
// wedged. Bounding: log-channels' appendEntry already rotates every channel
// file at a 128 MB cap — at one ~130-byte line per boot that is effectively
// unbounded history, so no custom rotation here.
export function writeBootEvent(): void {
  const now = Date.now();
  const event: BootEvent = {
    sampledAt: now,
    worktree: currentWorktreeName(),
    processStartedAt: Math.round(performance.timeOrigin),
    readyAt: now,
  };
  Log.channel("boot", { persist: true }).publish(JSON.stringify(event));
}

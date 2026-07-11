import { Log } from "@plugins/primitives/plugins/log-channels/server";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import type { BootLine } from "./schema";

// Writes the per-boot lines to the persisted `boot` log channel →
// ~/.singularity/worktrees/<wt>/logs/boot.jsonl: one `start` line at the
// register phase, one `ready` line from `onReady`. The two pair by
// processStartedAt (readBootEvents), so a backend that wedges during
// migrations / onReadyBlocking leaves an unpaired start — visible on the
// timeline exactly during deploy-restart bursts, previously a blind spot.
//
// A log-channel line, not a DB table: no migration, survives DB re-forks, and
// stays readable from the main backend's disk scan even while this backend is
// wedged. Bounding: log-channels' appendEntry already rotates every channel
// file at a 128 MB cap — at two ~140-byte lines per boot that is effectively
// unbounded history, so no custom rotation here.

function publish(line: BootLine): void {
  Log.channel("boot", { persist: true }).publish(JSON.stringify(line));
}

// The register phase is documented "no I/O" — this token is the deliberate,
// single exception: one synchronous ~140-byte file append whose entire point
// is landing BEFORE the boot work (migrations, onReadyBlocking) that can
// wedge. Routing it through onReady would re-create the blind spot it exists
// to close.
export const bootStartRegistration: Registration = {
  register() {
    publish({
      sampledAt: Date.now(),
      worktree: currentWorktreeName(),
      processStartedAt: Math.round(performance.timeOrigin),
      phase: "start",
    });
  },
};

export function writeBootReadyEvent(): void {
  const now = Date.now();
  publish({
    sampledAt: now,
    worktree: currentWorktreeName(),
    processStartedAt: Math.round(performance.timeOrigin),
    readyAt: now,
    phase: "ready",
  });
}

import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import type { TripContext, TraceSnapshot } from "../../core";
import { _traces } from "./tables";

// Assemble the snapshot envelope and insert one durable row. Runs inside the
// engine's runWithoutProfiling scope (its caller), so the insert never re-feeds
// the profiler. The flat trigger* / duration* / threshold* columns duplicate the
// snapshot's trigger so the list endpoint never selects the blob.
export async function persistTrace(
  ctx: TripContext,
  events: Record<string, unknown>,
): Promise<void> {
  const snapshot: TraceSnapshot = {
    v: 2,
    id: ctx.id,
    atMs: ctx.atMs,
    wallTime: ctx.wallTime,
    worktree: currentWorktreeName(),
    windowStartMs: ctx.windowStartMs,
    trigger: ctx.trigger,
    events,
  };

  await db.insert(_traces).values({
    id: ctx.id,
    worktree: snapshot.worktree,
    triggerKind: ctx.trigger.kind,
    triggerLabel: ctx.trigger.label,
    durationMs: ctx.trigger.durationMs,
    thresholdMs: ctx.trigger.thresholdMs,
    snapshot,
  });
}

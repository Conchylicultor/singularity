import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const WorktreeOpSchema = z.object({
  slug: z.string(),
  op: z.enum(["build", "push", "check"]),
  startedAt: z.string(),
  phase: z.enum(["waiting-for-lock", "running"]),
  // When a push is running, the instant the push lock was granted (waiting →
  // pushing). null for waiting pushes and builds. Lets the banner clock the
  // push separately from the time spent queued for the lock.
  runningAt: z.string().nullable(),
});
export type WorktreeOp = z.infer<typeof WorktreeOpSchema>;

// Map of worktree slug → its in-flight op. At most one op per worktree (push
// wins over build when both somehow run at once).
export const WorktreeOpsPayloadSchema = z.record(z.string(), WorktreeOpSchema);
export type WorktreeOpsPayload = z.infer<typeof WorktreeOpsPayloadSchema>;

export const worktreeOpsResource = resourceDescriptor<WorktreeOpsPayload>(
  "worktree-ops",
  WorktreeOpsPayloadSchema,
  {},
  { bootCritical: true },
);

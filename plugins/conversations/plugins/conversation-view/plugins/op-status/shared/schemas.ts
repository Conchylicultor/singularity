import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const WorktreeOpSchema = z.object({
  slug: z.string(),
  op: z.enum(["build", "push", "check"]),
  startedAt: z.string(),
  phase: z.enum(["waiting-for-lock", "running"]),
  // The instant this op's running phase began (its lock was granted). null while
  // waiting. Builds/checks stamp it into the marker on the grant; pushes derive
  // it from the holder file. Lets the banner clock work separately from the time
  // spent queued for the lock.
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
